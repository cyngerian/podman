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
          if (config.format === "standard" && config.setName) {
            title = `${config.setName} Draft`;
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
          }));

          startTransition(async () => {
            await createProposal(formData);
          });
        }}
      />
    </div>
  );
}
