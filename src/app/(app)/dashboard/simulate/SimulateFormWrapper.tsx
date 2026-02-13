"use client";

import { useTransition } from "react";
import CreateDraftForm from "@/components/draft/CreateDraftForm";
import { createSimulatedDraftAction } from "./actions";

export default function SimulateFormWrapper() {
  const [isPending, startTransition] = useTransition();

  return (
    <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
      <CreateDraftForm
        mode="simulate"
        onSubmit={(config) => {
          startTransition(async () => {
            await createSimulatedDraftAction({
              format: config.format,
              setCode: config.setCode || undefined,
              setName: config.setName || undefined,
              playerCount: config.playerCount,
              packsPerPlayer: config.packsPerPlayer,
              mixedPacks: config.mixedPacks,
              packSets: config.packSets ?? undefined,
              cubeList: config.cubeList ?? undefined,
              cubeSource: config.cubeSource ?? undefined,
              deckBuildingEnabled: config.deckBuildingEnabled,
              timerPreset: config.timerPreset,
              reviewPeriodSeconds: config.reviewPeriodSeconds,
              pacingMode: config.pacingMode,
              asyncDeadlineMinutes: config.asyncDeadlineMinutes ?? undefined,
              pickHistoryPublic: config.pickHistoryPublic,
            });
          });
        }}
      />
    </div>
  );
}
