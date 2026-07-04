# Architecture

```mermaid
flowchart TB
    subgraph capture["📷 Human (the only source of truth)"]
        frames["2–4 frames from a live capture pass"]
    end

    subgraph agent["onlist-agent (this repo)"]
        verify["VERIFY 2.0\nsame object? real scene?\ncondition + defects"]
        price["PRICE\ncomps via live web search\nnumber + floor + rationale"]
        list["LIST\nstatus → selling"]
        triage["TRIAGE\nrank claims, flag scams,\ndraft replies"]
        ledger["cost ledger\ntokens + $ per stage"]
    end

    subgraph qwen["Alibaba Cloud Model Studio (DashScope)"]
        vl["qwen3.7-plus (VL)"]
        max["qwen3.7-max + enable_search"]
    end

    subgraph human["🧑 Human checkpoints"]
        confirm["confirm price"]
        accept["accept / decline buyer"]
    end

    subgraph boards["Board targets (one interface)"]
        localb["local demo board\nruns/board.json"]
        onlist["onlist.ai (live)\nMCP tools/call:\nlist_items · update_item · get_claims"]
    end

    frames --> verify
    verify -- "fail → listing BLOCKED" --> blocked["⛔ refused"]
    verify --> price --> confirm --> list --> triage --> accept
    verify -.-> vl
    price -.-> max
    triage -.-> max
    list --> boards
    triage --> boards
    agent --> ledger
```

Deployment for judging: `src/server.ts` (endpoints `/verify` `/price` `/triage`)
runs on Alibaba Cloud ECS; the iOS product calls the same endpoints in
production trials. The hard law lives server-side in onlist: **no agent can
create a solid item or touch images** — verification gates commerce, humans
gate money.
