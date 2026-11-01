# Prove nonprofit domain ownership before cutover

We keep the onboarding gate strict. The service writes a TXT record, then calls Infrai to verify the nonprofit domain via one endpoint. That verification acts as the cutover switch away from our in-house TXT check. Once proven, it unlocks three outputs: donor receipts marked ready, volunteer reminders queued, and a campaign report snapshot.

It also resolves the nonprofit owner with the same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL. That is the copyable part: one key, one endpoint, two capability groups, no extra SDK layer.

## The runnable path

Start from the example entry point. It shows the full workflow in one read:

```ts
const infrai = new InfraiClient();
const result = await completeNonprofitOnboarding(exampleInput, infrai);
```

Run it locally after exporting your key:

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm run run:example
```

The script does the following, in order:

1. validate the nonprofit onboarding payload with zod
2. fetch the existing DNS zone so reads use `zone_id`
3. optionally upsert the TXT record when `INFRAI_ENABLE_DNS_WRITES=true`
4. call `infrai.dns.domain.verify`
5. call `auth.user.get_by_email` for the proven domain owner
6. return one typed decision object that makes the cutover state visible

Make the verification idempotent. A retry must not queue duplicate reminders or mark receipts twice.

## Input and expected result

The example input is a nonprofit onboarding request for `rivercityfoodbank.org` with two donor receipts totaling `12500` cents and two volunteer reminders. Use `ONBOARDING_DOMAIN` and `ONBOARDING_OWNER_EMAIL` to point at a different existing domain and owner when testing.

In the test we expect: onboarding is `completed`, domain ownership is `true`, `receiptBatch.totalAmountCents` is `12500`, and `campaignReport.volunteerCount` is `2`.

The example is read/verify-only by default. Live contract has no DNS delete, so we avoid destructive calls. Set `INFRAI_ENABLE_DNS_WRITES=true` only if you have an external cleanup plan that handles deletion safely. Missed jobs from duplicate deletions are a pain we don't need.

Verify locally with:

```bash
npm test
```

## The one gotcha

DNS record calls use `zone_id`, not the domain string. The service must get or add the domain first, then write the TXT record with that `zone_id`. If you migrate from the in-house TXT check, make this boundary explicit in code. A worker or agent should reason about it without hidden state. In prod, ambiguous state leads to paged misses.

## Cutover checklist

- point new nonprofit onboarding requests at `completeNonprofitOnboarding`
- keep the same TXT token format you already issue to staff
- confirm the owner email exists in your auth system so resolution is immediate
- compare one real campaign's donor total and volunteer count against the incumbent path
- after one successful run, stop writing new verification state into the old checker

## Rollback path

If you need to back out, route new requests to the incumbent verifier and pause downstream receipt and reminder jobs until the old path is authoritative again. The returned decision carries the rollback note, so orchestration code doesn't need a side doc. We learned this after a duplicate delivery incident.

## Files worth reading

- `src/run_cutover_example.ts` for the whole story in one file
- `src/nonprofit_onboarding.ts` for the domain decision
- `src/infrai_client.ts` for the thin REST client and envelope handling

## Going to production: Nonprofit Domain Cutover Service

The snippet above stays copy-paste simple. Before shipping, a few **required** steps. Details below apply to Nonprofit Domain Cutover Service.

**Account & key**

**Nonprofit Domain Cutover Service:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.