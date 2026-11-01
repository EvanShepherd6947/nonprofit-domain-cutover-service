import { InfraiClient } from "./infrai_client.js";
import { completeNonprofitOnboarding } from "./nonprofit_onboarding.js";

const exampleInput = {
  nonprofitName: "River City Food Bank",
  domain: process.env.ONBOARDING_DOMAIN ?? "rivercityfoodbank.org",
  ownerEmail: process.env.ONBOARDING_OWNER_EMAIL ?? "chenhua@changba.com",
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
    },
    {
      volunteerEmail: "volunteer.two@example.org",
      shiftIso: "2026-04-11T16:00:00Z"
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
};

async function main(): Promise<void> {
  const infrai = new InfraiClient();
  const result = await completeNonprofitOnboarding(exampleInput, infrai, {
    writeDns: process.env.INFRAI_ENABLE_DNS_WRITES === "true"
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
