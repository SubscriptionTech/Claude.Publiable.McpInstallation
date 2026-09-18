# API Live contract

`pa-live-openapi-3.0.3.yaml` — the ProAbono **API Live** contract. Authoritative for endpoints,
parameters, payloads, response shapes and authentication. Nothing in this project may infer API
behaviour from memory, from the web, or from an older spec when this file can answer.

## Where it comes from

It is a **copy**. The contract is authored and maintained in
[SubscriptionTech/Claude.SharedApi.ProAbonoLive](https://github.com/SubscriptionTech/Claude.SharedApi.ProAbonoLive),
alongside the resource documentation it is kept in sync with. That repository is private and is no
longer attached to this project: the build vendors this copy into `dist/resources/openapi.json`, so
a clone builds with no credential and CI needs no cross-repository token.

Never edit this file to change the API. An edit here is lost at the next refresh, and it makes the
generated code disagree with the API the customer actually calls. Fix the contract upstream, then
refresh.

## Refreshing it

When the API Live changes, copy the file over from the upstream repository and rebuild:

```bash
cp <path-to>/Claude.SharedApi.ProAbonoLive/open-api/pa-live-openapi-3.0.3.yaml specs/open-api/
npm run build && npm test
```

The test suite reads the vendored result, so a contract that no longer parses, or that drops an
endpoint the tools rely on, fails there rather than in a customer's IDE. Commit the refreshed
contract on its own, with the upstream commit it was taken from in the message.

## What it does not carry

The upstream repository also holds the resource documentation, the enum reference and the
conventions that explain the contract — `specs/convention.md`, `specs/resources-index.md` and the
`resources/` folder. They are not copied here. When a question needs them rather than the schema,
read them upstream; do not guess from the YAML alone.
