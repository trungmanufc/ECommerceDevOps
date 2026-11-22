# Run the shop on AWS: k3s on one EC2 server

This guide puts the shop on a single virtual server in AWS (an **EC2
instance**) running **k3s**, a small Kubernetes distribution that fits on one
machine. It is the same Kubernetes you used in Docker Desktop, so the
manifests barely change. Only the differences live in `k8s/aws/`.

```
Your browser ──http:80──> EC2 instance (Ubuntu + k3s)
                              └── namespace "shop"
                                    frontend → product / cart / order → postgres, redis
                                    images pulled from ghcr.io (pushed by CI)
```

In this step everything is done by hand, so you see each piece. Automating it
(CD from GitHub Actions, and later Terraform or Ansible) comes afterwards.

## What it costs

A `t3.small` (2 vCPU, 2 GB RAM) costs a few cents per hour. Left running
24/7, the server, its 20 GB disk and its public IP add up to roughly
**US$20–25 per month**, depending on the region. New AWS accounts get free
credits that cover this for a while; check **Billing → Credits** in the
console.

Before you start, create a budget alert so you get an email if spending
goes over what you expect: **Billing → Budgets → Create budget →
"Monthly cost budget"**, for example US$10.

To stop paying, see [Stop or delete the server](#7-stop-or-delete-the-server).

## 1. Launch the EC2 instance

In the AWS console, pick a region near you (top right, for example
*Asia Pacific (Singapore) ap-southeast-1*), then **EC2 → Launch instance**:

| Setting | Value | Why |
|---|---|---|
| Name | `microshop` | |
| AMI | Ubuntu Server 24.04 LTS (64-bit x86) | A common Linux; k3s supports it |
| Instance type | `t3.small` | 2 GB RAM. The shop needs ~0.7 GB, k3s ~0.5 GB. `t3.micro` (1 GB) is too small |
| Key pair | **Create new key pair** → name `microshop`, type ED25519, format `.pem` | This file is your SSH login. AWS gives it to you once; keep it |
| Network → Security group | Create one with the two rules below | The server's firewall |
| Storage | 20 GiB gp3 | Room for images and the database |

Security group rules (inbound):

| Type | Port | Source | Purpose |
|---|---|---|---|
| SSH | 22 | **My IP** | Only your computer can log in |
| HTTP | 80 | Anywhere (0.0.0.0/0) | Anyone can open the shop |

Click **Launch instance**. When it shows *Running*, copy its **Public IPv4
address** from the instance details. Below it is written `<server-ip>`.

## 2. Log in with SSH (from Windows)

Windows 11 includes the `ssh` command. Move the downloaded key and lock its
permissions down, or SSH refuses to use it ("UNPROTECTED PRIVATE KEY FILE"):

```powershell
New-Item -ItemType Directory -Force $HOME\.ssh
Move-Item $HOME\Downloads\microshop.pem $HOME\.ssh\microshop.pem
icacls $HOME\.ssh\microshop.pem /inheritance:r /grant:r "${env:USERNAME}:R"

ssh -i $HOME\.ssh\microshop.pem ubuntu@<server-ip>
```

Answer `yes` to the fingerprint question the first time. Your prompt now
shows `ubuntu@ip-...`: every command from here on runs **on the server**.

## 3. Install k3s

```bash
curl -sfL https://get.k3s.io | sh -s - --disable traefik --write-kubeconfig-mode 644
```

- `get.k3s.io` is the official installer. It sets k3s up as a system service
  that starts on boot.
- `--disable traefik`: k3s ships with Traefik, a web router that takes over
  port 80. The shop's own nginx frontend already does that job, so it is
  turned off. (Traefik, as an *Ingress*, is a good later topic.)
- `--write-kubeconfig-mode 644` lets the `ubuntu` user run `kubectl` without
  `sudo`. This is fine on a server only you log in to.

k3s includes `kubectl`. Check that the cluster is up:

```bash
kubectl get nodes          # one node, STATUS Ready (may take ~30 s)
kubectl get pods -A        # k3s's own system pods
```

## 4. Get the manifests

```bash
git clone https://github.com/trungmanufc/ECommerceDevOps.git
cd ECommerceDevOps
kubectl kustomize k8s/aws | less     # optional: see exactly what will be created (q to quit)
```

## 5. Create the database password

The local manifests carry a throw-away password in git. The AWS overlay
removes it, so you create the real one here. It exists only inside the
cluster:

```bash
kubectl create namespace shop
kubectl -n shop create secret generic postgres-credentials \
  --from-literal=password="$(openssl rand -base64 24)"
```

`openssl rand` makes a random password. You never need to type it: Kubernetes
gives it to PostgreSQL and to the services.

## 6. Deploy the shop

```bash
kubectl apply -k k8s/aws
kubectl -n shop get pods -w     # Ctrl+C once every pod is Running and 1/1
```

The first start takes a minute or two while the server downloads the images
from ghcr.io. A warning about the `shop` namespace missing an annotation is
harmless: you created the namespace by hand in step 5.

Open **http://&lt;server-ip&gt;** in your browser. That is your shop, on the
internet.

The experiments from the README (deleting a pod, scaling, logs) work the same
way here.

### Deploy a new version

When you push to `main`, CI builds new images tagged `latest`. To run them:

```bash
cd ~/ECommerceDevOps && git pull           # picks up manifest changes, if any
kubectl apply -k k8s/aws
kubectl -n shop rollout restart deploy/product-service deploy/cart-service deploy/order-service deploy/frontend
kubectl -n shop rollout status deploy/order-service
```

The restart is needed because the tag `latest` did not change, so Kubernetes
does not know there is something new. For images tagged `latest` it always
re-downloads when a pod starts. Doing this by hand is exactly what the **CD**
step will automate, with exact `sha-<commit>` tags instead of `latest`.

## 7. Stop or delete the server

In **EC2 → Instances**, select `microshop`:

- **Instance state → Stop**: the server shuts down and you stop paying for it.
  You still pay a little for the disk (about US$2/month). The data is kept, and
  k3s and the shop start again on their own when you **Start** it. The public
  IP **changes** after a start, so look it up again. (An *Elastic IP* keeps it
  fixed. That can wait.)
- **Instance state → Terminate**: deletes the server and its disk, including
  the database. Nothing is billed afterwards.

## 8. Deploy automatically from GitHub Actions (CD)

The `deploy` job in `.github/workflows/ci.yml` does the
[Deploy a new version](#deploy-a-new-version) steps for you after every push
to `main`: once the tests have passed and the images are built, it logs in
to the server over SSH and applies the manifests with the commit's exact
`sha-<commit>` image tags.

```
push to main → test → build + push images → deploy: ssh ubuntu@server 'kubectl apply' → rollout status
```

It needs three things, set up once:

**1. Let GitHub's machines reach SSH.** GitHub's runners come from many
changing IP addresses, so "My IP" blocks them. In **EC2 → Security groups**,
edit the SSH rule: Source → **Anywhere-IPv4 (0.0.0.0/0)**. This is safe
enough for a practice server because Ubuntu on EC2 accepts **only key
logins**, never passwords: without `microshop.pem` nobody gets in. (Tighter
options, such as AWS Systems Manager with no open port, can come later.)

**2. Give GitHub the key** as a *secret*. In the repository on GitHub:
**Settings → Secrets and variables → Actions → Secrets → New repository
secret**:

| Name | Value |
|---|---|
| `EC2_SSH_KEY` | The whole content of `microshop.pem`, including the `-----BEGIN` and `-----END` lines |

To copy it in PowerShell: `Get-Content $HOME\.ssh\microshop.pem -Raw | Set-Clipboard`.
A secret can be used by workflows but never read back, not even by you.

**3. Tell GitHub where the server is** as a *variable* (the IP is not
secret, so it can show in the logs). Same page, **Variables** tab → **New
repository variable**:

| Name | Value |
|---|---|
| `EC2_HOST` | `<server-ip>`, for example `13.250.10.20` |

Push any commit to `main` and watch the **Actions** tab. The run now has a
fourth job, **Deploy to AWS**, and the repository page shows a
**production** environment with a link to the shop.

Notes:

- **The IP changes when you Stop and Start the server.** Update `EC2_HOST`
  afterwards. While the server is stopped, delete the variable: the deploy
  job is then skipped instead of failing.
- Pull requests never deploy. Only `main` does.
- To check what is running: `kubectl -n shop get deploy -o wide` on the
  server shows the `sha-<commit>` tag of each image.

## Troubleshooting

| You see | Meaning | Fix |
|---|---|---|
| `ssh` hangs, then times out | Security group blocks you, or your IP changed | Edit the SSH rule: Source → My IP |
| Browser cannot reach `http://<server-ip>` | Port 80 not open, or you used `https://` | Check the HTTP rule; use `http://` |
| Pod `CreateContainerConfigError` | The Secret from step 5 is missing | Create it. The pods retry on their own |
| Pod `ImagePullBackOff` | Image name or tag wrong, or the GHCR package is private | `kubectl -n shop describe pod <name>`, look at Events |
| Pod `Pending` | Not enough memory on the server | `kubectl describe pod <name>`. Use a bigger instance or fewer replicas |
| Pods `CrashLoopBackOff` | The app starts, then fails | `kubectl -n shop logs <pod> --previous` |
| Deploy job: `Host key verification failed` or `Connection timed out` | GitHub cannot reach port 22, or `EC2_HOST` is the old IP | Check the SSH rule is 0.0.0.0/0 and the IP is current |
| Deploy job: `Permission denied (publickey)` | `EC2_SSH_KEY` is incomplete | Paste the whole `.pem` again, BEGIN and END lines included |
| Deploy job: `rollout status` times out | The new pods do not become ready | On the server: `kubectl -n shop get pods`, then `describe` / `logs` |
