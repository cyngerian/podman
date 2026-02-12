"use client";

import { useRef } from "react";
import CreateDraftForm from "@/components/draft/CreateDraftForm";
import { createProposal } from "../actions";

export default function ProposalFormWrapper({ groupId }: { groupId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={createProposal}>
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="title" id="proposal-title" />
      <input type="hidden" name="format" id="proposal-format" />
      <input type="hidden" name="set_code" id="proposal-set-code" />
      <input type="hidden" name="set_name" id="proposal-set-name" />
      <input type="hidden" name="player_count" id="proposal-player-count" />
      <input type="hidden" name="config" id="proposal-config" />

      <CreateDraftForm
        onSubmit={(config) => {
          const form = formRef.current;
          if (!form) return;

          // Build title
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

          // Populate hidden fields
          (form.querySelector("#proposal-title") as HTMLInputElement).value = title;
          (form.querySelector("#proposal-format") as HTMLInputElement).value = config.format;
          (form.querySelector("#proposal-set-code") as HTMLInputElement).value = config.setCode ?? "";
          (form.querySelector("#proposal-set-name") as HTMLInputElement).value = config.setName ?? "";
          (form.querySelector("#proposal-player-count") as HTMLInputElement).value = String(config.playerCount);
          (form.querySelector("#proposal-config") as HTMLInputElement).value = JSON.stringify({
            pacingMode: config.pacingMode,
            timerPreset: config.timerPreset,
            reviewPeriodSeconds: config.reviewPeriodSeconds,
            asyncDeadlineMinutes: config.asyncDeadlineMinutes,
            deckBuildingEnabled: config.deckBuildingEnabled,
            pickHistoryPublic: config.pickHistoryPublic,
            cubeList: config.cubeList,
            cubeSource: config.cubeSource,
          });

          form.requestSubmit();
        }}
      />
    </form>
  );
}
