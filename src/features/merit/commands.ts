import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { FIRE_ORANGE, FIRE_RED } from "../../config";
import {
  canManageJarvis,
  getJarvisRank as getActorRank,
  rankAtLeast,
} from "../../discord/permissions";
import { logger } from "../../lib/logger";
import {
  MeritError,
  type LeaderboardRow,
  type MeritHistoryRow,
  type MeritType,
  assertCanAward,
  assertCanManageData,
  assertCanRemove,
  assertCanViewHistory,
  assertNotProtectedOwner,
  auditAward,
  auditRemoval,
  auditReset,
  fixedMeritAmount,
  getLeaderboard,
  getMemberHistory,
  getMemberTotal,
  meritTypeLabel,
  recordAward,
  recordRemoval,
  resetAllData,
} from "./service";

/** Extract every unique user ID from an announcement blob containing <@ID> or <@!ID> mentions. */
export function extractMentionIds(text: string): string[] {
  const seen = new Set<string>();
  const pattern = /<@!?(\d+)>/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    seen.add(match[1]);
  }
  return [...seen];
}

/** True only for a real Discord message link (channels/<guild>/<channel>/<message>). */
export function isDiscordMessageLink(url: string): boolean {
  return /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/\d+\/\d+\/\d+$/.test(
    url.trim(),
  );
}

// ─── /addmerit, /removemerit ────────────────────────────────────────────────

export async function handleAddMerit(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!rankAtLeast(member, "hr")) {
    await interaction.reply({
      content: "Access Denied — HR and above only.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const meritType = interaction.options.getSubcommand() as MeritType;
    const actorRank = getActorRank(member);
    assertCanAward(actorRank, meritType);

    if (meritType === "bonus") {
      const usersRaw = interaction.options.getString("users", true);
      const amount = interaction.options.getNumber("amount", true);
      const mentionIds = extractMentionIds(usersRaw);
      if (mentionIds.length === 0) {
        throw new MeritError(
          "No @mentions found. Make sure you @mention one or more members.",
        );
      }
      for (const id of mentionIds) assertNotProtectedOwner(actorRank, id);

      const fetchResults = await Promise.allSettled(
        mentionIds.map((id) => interaction.guild!.members.fetch(id)),
      );
      const
