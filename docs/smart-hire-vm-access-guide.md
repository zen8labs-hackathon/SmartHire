# Smart Hire VM — Setup & Access Guide

Guide for connecting to the `smart-hire` server. Written for developers with no prior AWS
experience — no AWS knowledge is assumed.

## What you have

| Thing | Value |
|---|---|
| Server (EC2 instance ID) | `i-040a0bcdfe9618b56` |
| Public IP | `18.142.230.72` |
| Domain | `smart-hire.zen8labs.io` |
| OS | Ubuntu 24.04 LTS |
| Size | t3.xlarge — 4 vCPU, 16 GB RAM, 100 GB disk |
| Region | `ap-southeast-1` (Singapore) |
| AWS account | `405188851544` |

**There is no SSH key and no SSH port.** You log in through AWS Session Manager (SSM)
instead. This is intentional: nothing to lose, no key to leak, and access is granted by
your company SSO account. If you're used to `ssh -i key.pem ubuntu@...`, forget that here —
the equivalent is `aws ssm start-session`.

Your access comes from being a member of the **Smart Hire Team** SSO group. If you get
permission errors, that group membership is the first thing to check (ask Hung).

---

## One-time setup

You need **two** programs. Both are required. The second one is the one everybody forgets,
and its error message is unhelpful, so don't skip it.

### 1. Install the AWS CLI

**macOS**
```bash
brew install awscli
```

**Windows** — download and run the installer:
<https://awscli.amazonaws.com/AWSCLIV2.msi>

**Linux (Ubuntu/Debian)**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip awscliv2.zip && sudo ./aws/install
```

Verify — must print version 2.x:
```bash
aws --version
```

### 2. Install the Session Manager plugin

This is a **separate** program from the AWS CLI. Without it, connecting fails.

**macOS**
```bash
brew install --cask session-manager-plugin
```

**Windows** — download and run:
<https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe>

**Linux (Ubuntu/Debian)**
```bash
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb" -o sm.deb
sudo dpkg -i sm.deb
```

Verify:
```bash
session-manager-plugin
```
It should print `The Session Manager plugin is installed successfully`.

### 3. Configure SSO login

Run:
```bash
aws configure sso
```

Answer the prompts **exactly** like this:

| Prompt | Answer |
|---|---|
| `SSO session name` | `zen8labs` |
| `SSO start URL` | `https://zen8labs.awsapps.com/start` |
| `SSO region` | `ap-southeast-1` |
| `SSO registration scopes` | press Enter (accept default) |

Your browser opens — log in with your zen8labs account and click **Allow**. Back in the
terminal:

| Prompt | Answer |
|---|---|
| Account | choose **405188851544** |
| Role | choose **SSM-smart-hire-EC2-Team** |
| `Default client Region` | `ap-southeast-1` |
| `Default output format` | `json` |
| `Profile name` | `smart-hire` |

If the account or role list is empty, your SSO group membership isn't active — stop and ask
Hung rather than retrying.

Confirm it works:
```bash
aws sts get-caller-identity --profile smart-hire
```
You should see account `405188851544` and a role name containing `SSM-smart-hire-EC2-Team`.

---

## Connecting to the server

```bash
aws ssm start-session --target i-040a0bcdfe9618b56 --profile smart-hire
```

You'll land in a shell as the `ssm-user`. To do admin work (installing packages, editing
nginx), switch to root first:

```bash
sudo su - ubuntu     # normal working user, or:
sudo -i              # root
```

Leave the server with `exit` (twice if you used `sudo -i`).

**Your SSO login expires after 4 hours.** When commands start failing with an expired-token
error, just run:
```bash
aws sso login --profile smart-hire
```
You do not repeat `aws configure sso` — that's one-time only.

---

## Useful things

### Copy a file to the server

There's no `scp` here (no SSH). Easiest options:

- Pull from git on the server (preferred).
- Small files: paste into an editor on the server (`nano file.txt`).
- Or use SSM's file transfer via port forwarding (below) if you really need it.

### Port forwarding — test before DNS/SSL is ready

This maps a port on the server to your laptop, so you can open it in your local browser
**without** exposing it to the internet. Very useful for testing the app before nginx and
SSL are configured.

```bash
aws ssm start-session \
  --target i-040a0bcdfe9618b56 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3000"],"localPortNumber":["3000"]}' \
  --profile smart-hire
```

Then open <http://localhost:3000> on your laptop. Ctrl+C to stop.

### Run one command without a full session

```bash
aws ssm start-session --target i-040a0bcdfe9618b56 --profile smart-hire
```
is interactive. For scripted one-offs, ask Hung — the `SendCommand` permission isn't in your
role by default.

---

## Setting up the app and SSL

The server is **bare Ubuntu** — nothing is installed yet. The firewall (AWS security group)
already allows inbound **80** and **443** from the internet, and `smart-hire.zen8labs.io`
already points at the server, so certbot's HTTP challenge will work.

Rough path (adjust to your stack):

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx
# configure your app + an nginx server block for smart-hire.zen8labs.io, then:
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d smart-hire.zen8labs.io
```

Certbot will handle the certificate and auto-renewal.

> Only ports 80 and 443 are open to the internet. If your app listens on 3000/8080, don't
> ask for that port to be opened — put nginx in front of it. That's the intended design.

For the full app deploy (Docker, Postgres, migrate, nginx, SSL), see the Vietnamese
guide [huong-dan-deploy-aws-ec2.md](./huong-dan-deploy-aws-ec2.md) (short English
checklist: [aws-ec2-deploy.md](./aws-ec2-deploy.md)).

---

## Rules and warnings

**Do not stop the instance.** This is the big one. The server has an auto-assigned public
IP, which **changes if the instance is stopped and started**. If that happens,
`smart-hire.zen8labs.io` silently points at the wrong address and your SSL breaks — and the
fix requires someone with admin access to update DNS. Rebooting from inside
(`sudo reboot`) is safe. Stopping it from the AWS console is not.

Other notes:

- The server costs roughly **$120/month** while running. Don't leave experiments running.
- Your access is limited to this one server — it's scoped by a `Team=smart-hire-team` tag.
  You won't be able to touch other machines in the account, by design.
- Don't install an SSH server or open port 22. SSM is the access path.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `SessionManagerPlugin is not found` | The plugin isn't installed — do step 2 above. |
| `Error when retrieving token from sso: Token has expired` | Run `aws sso login --profile smart-hire`. |
| `An error occurred (AccessDeniedException)` on `start-session` | You're not in the **Smart Hire Team** group, or you picked the wrong role in `aws configure sso`. Check `aws sts get-caller-identity --profile smart-hire`. |
| `TargetNotConnected` | The SSM agent on the server isn't reachable. Ask Hung to check the instance is running. |
| Account/role list empty at SSO setup | Group membership missing — ask Hung. |
| Browser doesn't open on `aws sso login` | Copy the URL printed in the terminal into your browser manually. |
| `certbot` fails the challenge | Check nginx is running and listening on 80: `sudo systemctl status nginx`. DNS is already correct, so it's almost always nginx. |

If you're stuck for more than a few minutes, ask — most of these are one-line fixes and
they're not worth grinding on.
