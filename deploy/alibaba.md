# Deploying to Alibaba Cloud (proof-of-deployment recording)

Two easy paths — pick one, record the console + a curl in one take.

> **HTTPS matters for the demo page.** The "live pass" camera capture
> (getUserMedia) only works in a secure context. Bare ECS on `http://ip:8080`
> still demos fine — the page falls back to per-shot "+ Add frame" capture and
> says so — but for the full live-pass experience use **Function Compute**
> (HTTPS out of the box, and a second Alibaba service on the diagram) or put
> the ECS box behind a domain + Caddy. The QR block on the page always works:
> judges on desktop scan it and continue on their phone.

## A. ECS (simplest to show)

1. ECS console → create instance (ecs.t6, Ubuntu 24.04, HK/Singapore region
   works well with dashscope-intl) → allow port 8080 in the security group.
2. SSH in and run:

```bash
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
git clone https://github.com/<you>/onlist-agent && cd onlist-agent
bun install
export DASHSCOPE_API_KEY=sk-...
nohup bun src/server.ts > agent.log 2>&1 &
```

3. On camera:

```bash
curl http://<ecs-ip>:8080/health
curl -X POST http://<ecs-ip>:8080/price \
  -H 'Content-Type: application/json' \
  -d '{"title":"Shure MV7 USB/XLR Microphone"}'
```

## B. Container (ACR + ECS/FC)

```bash
docker build -t onlist-agent .
docker tag onlist-agent registry-intl.<region>.aliyuncs.com/<ns>/onlist-agent
docker push registry-intl.<region>.aliyuncs.com/<ns>/onlist-agent
# then run it on ECS: docker run -e DASHSCOPE_API_KEY=... -p 8080:8080 <image>
```

Recording checklist (per hackathon rules): Alibaba Cloud console visible →
the running service → curl with a real Qwen-powered response → the code with
DashScope calls (src/qwen.ts) in the editor.
