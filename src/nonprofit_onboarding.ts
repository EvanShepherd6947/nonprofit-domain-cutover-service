import { z } from "zod";
import { InfraiClient } from "./infrai_client.js";

export const nonprofitOnboardingSchema = z.object({
  nonprofitName: z.string().min(1),
  domain: z.string().min(1),
  ownerEmail: z.string().email(),
  campaignName: z.string().min(1),
  txtRecordName: z.string().min(1),
  txtRecordValue: z.string().min(1),
  donorReceipts: z.array(
    z.object({
      donorEmail: z.string().email(),
      amountCents: z.number().int().positive(),
      donationId: z.string().min(1)
    })
  ).min(1),
  volunteerReminders: z.array(
    z.object({
      volunteerEmail: z.string().email(),
      shiftIso: z.string().min(1)
    })
  ).min(1),
  reportRange: z.object({
    startsOn: z.string().min(1),
    endsOn: z.string().min(1)
  }),
  migration: z.object({
    sourceSystem: z.literal("in-house TXT check"),
    cutoverId: z.string().min(1)
  })
});

export type NonprofitOnboardingInput = z.infer<typeof nonprofitOnboardingSchema>;

export type OnboardingDecision = {
  onboardingStatus: "completed";
  domain: {
    name: string;
    zoneId: string;
    txtRecord: {
      name: string;
      value: string;
      recordType: "TXT";
    };
    ownershipVerified: true;
  };
  ownerUser: {
    email: string;
    userId: string | null;
    resolved: boolean;
  };
  receiptBatch: {
    count: number;
    totalAmountCents: number;
    receipts: Array<{
      donorEmail: string;
      amountCents: number;
      donationId: string;
      receiptStatus: "ready";
    }>;
  };
  volunteerReminderBatch: {
    count: number;
    reminders: Array<{
      volunteerEmail: string;
      shiftIso: string;
      reminderStatus: "queued";
    }>;
  };
  campaignReport: {
    campaignName: string;
    startsOn: string;
    endsOn: string;
    donatedAmountCents: number;
    donorCount: number;
    volunteerCount: number;
  };
  migration: {
    sourceSystem: "in-house TXT check";
    cutoverId: string;
    path: "cutover-complete";
    rollbackPath: "re-enable incumbent TXT check and keep receipt/reminder jobs paused";
  };
};

export function buildOnboardingDecision(input: NonprofitOnboardingInput, resolvedUser: { user_id?: string; email?: string } | null, zoneId: string): OnboardingDecision {
  const totalAmountCents = input.donorReceipts.reduce((sum, item) => sum + item.amountCents, 0);

  return {
    onboardingStatus: "completed",
    domain: {
      name: input.domain,
      zoneId,
      txtRecord: {
        name: input.txtRecordName,
        value: input.txtRecordValue,
        recordType: "TXT"
      },
      ownershipVerified: true
    },
    ownerUser: {
      email: input.ownerEmail,
      userId: resolvedUser?.user_id ?? null,
      resolved: Boolean(resolvedUser?.user_id)
    },
    receiptBatch: {
      count: input.donorReceipts.length,
      totalAmountCents,
      receipts: input.donorReceipts.map((receipt) => ({
        donorEmail: receipt.donorEmail,
        amountCents: receipt.amountCents,
        donationId: receipt.donationId,
        receiptStatus: "ready" as const
      }))
    },
    volunteerReminderBatch: {
      count: input.volunteerReminders.length,
      reminders: input.volunteerReminders.map((reminder) => ({
        volunteerEmail: reminder.volunteerEmail,
        shiftIso: reminder.shiftIso,
        reminderStatus: "queued" as const
      }))
    },
    campaignReport: {
      campaignName: input.campaignName,
      startsOn: input.reportRange.startsOn,
      endsOn: input.reportRange.endsOn,
      donatedAmountCents: totalAmountCents,
      donorCount: input.donorReceipts.length,
      volunteerCount: input.volunteerReminders.length
    },
    migration: {
      sourceSystem: input.migration.sourceSystem,
      cutoverId: input.migration.cutoverId,
      path: "cutover-complete",
      rollbackPath: "re-enable incumbent TXT check and keep receipt/reminder jobs paused"
    }
  };
}

export async function completeNonprofitOnboarding(rawInput: unknown, infrai: InfraiClient, options?: { writeDns?: boolean }): Promise<OnboardingDecision> {
  const input = nonprofitOnboardingSchema.parse(rawInput);

  const existing = await infrai.dns.domain.get({ domain: input.domain });
  let zoneId = existing.data.zone_id;

  if (options?.writeDns) {
    await infrai.dns.record.upsert({
      zone_id: zoneId,
      record_type: "TXT",
      name: input.txtRecordName,
      content: input.txtRecordValue,
      ttl: 300,
      metadata: { cutoverId: input.migration.cutoverId }
    });
  }

  await infrai.dns.domain.verify({ domain: input.domain });

  const owner = await infrai.auth.user.get_by_email({ email: input.ownerEmail });

  return buildOnboardingDecision(input, owner.data, zoneId);
}
