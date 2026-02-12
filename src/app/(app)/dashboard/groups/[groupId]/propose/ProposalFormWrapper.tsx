"use client";

import { useTransition } from "react";
import CreateDraftForm from "@/components/draft/CreateDraftForm";
import { createProposal } from "../actions";

export default function ProposalFormWrapper({ groupId }: { groupId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
      <CreateDraftForm
        onSubmit={(config) => {
          let title = "";
          if (config.format === "standard") {
            if (config.mixedPacks && config.packSets && config.packSets.length > 0) {
              // Deduplicate set names for title
              const uniqueNames = [...new Set(config.packSets.map((s) => s.name))];
              title = `${uniqueNames.join(" / ")} Draft`;
            } else if (config.setName) {
              title = `${config.setName} Draft`;
            } else {
              title = "Standard Draft";
            }
          } else if (config.format === "winston") {
            title = "Winston Draft";
          } else if (config.format === "cube") {
            title = "Cube Draft";
          } else {
            title = `${config.format} Draft`;
          }

          const formData = new FormData();
          formData.set("group_id", groupId);
          formData.set("title", title);
          formData.set("format", config.format);
          formData.set("set_code", config.setCode ?? "");
          formData.set("set_name", config.setName ?? "");
          formData.set("player_count", String(config.playerCount));
          formData.set("config", JSON.stringify({
            pacingMode: config.pacingMode,
            timerPreset: config.timerPreset,
            reviewPeriodSeconds: config.reviewPeriodSeconds,
            asyncDeadlineMinutes: config.asyncDeadlineMinutes,
            deckBuildingEnabled: config.deckBuildingEnabled,
            pickHistoryPublic: config.pickHistoryPublic,
            cubeList: config.cubeList,
            cubeSource: config.cubeSource,
            packsPerPlayer: config.packsPerPlayer,
            packSets: config.packSets,
          }));

          startTransition(async () => {
            await createProposal(formData);
          });
        }}
      />
    </div>
  );
}
