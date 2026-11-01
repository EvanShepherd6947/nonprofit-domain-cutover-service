import test from "node:test";
import assert from "node:assert/strict";
import { buildOnboardingDecision, nonprofitOnboardingSchema } from "../src/nonprofit_onboarding.js";

test("verified domain unlocks receipts, volunteer reminders, and campaign reporting", () => {
  const input = nonprofitOnboardingSchema.parse({
    nonprofitName: "River City Food Bank",
    domain: "rivercityfoodbank.org",
    ownerEmail: "ops@rivercityfoodbank.org",
    campaignName: "Spring Pantry Drive",
    txtRecordName: "_onboarding.rivercityfoodbank.org",
    txtRecordValue: "nonprofit-cutover-2026-04",
    donorReceipts: [
      {
        donorEmail: "donor.one@example.org",
        amountCents: 5000,
        donationId: "don_1001"
      },
      {
        donorEmail: "donor.two@example.org",
        amountCents: 7500,
        donationId: "don_1002"
      }
    ],
    volunteerReminders: [
      {
        volunteerEmail: "volunteer.one@example.org",
        shiftIso: "2026-04-10T14:00:00Z"
      }
    ],
    reportRange: {
      startsOn: "2026-04-01",
      endsOn: "2026-04-30"
    },
    migration: {
      sourceSystem: "in-house TXT check",
      cutoverId: "cutover_rcfb_2026_04"
    }
  });

  const decision = buildOnboardingDecision(input, { user_id: "usr_123", email: input.ownerEmail }, "zone_abc123");

  assert.equal(decision.onboardingStatus, "completed");
  assert.equal(decision.domain.ownershipVerified, true);
  assert.equal(decision.domain.zoneId, "zone_abc123");
  assert.equal(decision.ownerUser.userId, "usr_123");
  assert.equal(decision.receiptBatch.count, 2);
  assert.equal(decision.receiptBatch.totalAmountCents, 12500);
  assert.equal(decision.volunteerReminderBatch.count, 1);
  assert.equal(decision.campaignReport.donatedAmountCents, 12500);
  assert.equal(decision.campaignReport.donorCount, 2);
  assert.equal(decision.campaignReport.volunteerCount, 1);
  assert.equal(decision.migration.path, "cutover-complete");
});
