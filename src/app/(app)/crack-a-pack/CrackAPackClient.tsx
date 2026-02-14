"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import SetPicker from "@/components/draft/SetPicker";
import PickScreen from "@/components/draft/PickScreen";
import { crackAPackAction } from "./actions";
import type { CardReference } from "@/lib/types";

interface BoosterProduct {
  code: string;
  name: string;
}

/**
 * Strip set name prefix from product name to get just the type.
 * e.g. "Murders at Karlov Manor Play Booster" → "Play Booster"
 * For base code products (no suffix), display as "Booster".
 */
function getDisplayName(product: BoosterProduct, setName: string): string {
  const name = product.name;
  // Try stripping the set name prefix
  if (name.startsWith(setName)) {
    const suffix = name.slice(setName.length).trim();
    return suffix || "Booster";
  }
  return name;
}

export default function CrackAPackClient() {
  const [selectedSet, setSelectedSet] = useState<{ code: string; name: string } | null>(null);
  const [boosterProducts, setBoosterProducts] = useState<BoosterProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<BoosterProduct | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [packCards, setPackCards] = useState<CardReference[] | null>(null);
  const [packKey, setPackKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch booster products when set changes
  const handleSetChange = useCallback((set: { code: string; name: string } | null) => {
    setSelectedSet(set);
    setBoosterProducts([]);
    setSelectedProduct(null);
    setLoadingProducts(!!set);
  }, []);

  useEffect(() => {
    if (!selectedSet) return;

    let cancelled = false;

    fetch(`/api/boosters?set=${selectedSet.code}`)
      .then((res) => res.json())
      .then((data: BoosterProduct[]) => {
        if (cancelled) return;
        setBoosterProducts(data);
        if (data.length > 0) {
          setSelectedProduct(data[0]);
        }
        setLoadingProducts(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBoosterProducts([]);
        setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSet]);

  const crackPack = useCallback(
    (setCode: string, productCode?: string) => {
      setError(null);
      startTransition(async () => {
        const result = await crackAPackAction(setCode, productCode);
        if ("error" in result) {
          setError(result.error);
        } else {
          setPackCards(result.cards);
          setPackKey((k) => k + 1);
        }
      });
    },
    [],
  );

  const handleCrack = useCallback(() => {
    if (selectedSet) crackPack(selectedSet.code, selectedProduct?.code);
  }, [selectedSet, selectedProduct, crackPack]);

  const handleCrackAnother = useCallback(() => {
    if (selectedSet) crackPack(selectedSet.code, selectedProduct?.code);
  }, [selectedSet, selectedProduct, crackPack]);

  const handleBackToSetPicker = useCallback(() => {
    setPackCards(null);
    setError(null);
    handleSetChange(null);
  }, [handleSetChange]);

  // Pack view
  if (packCards && selectedSet) {
    return (
      <PickScreen
        key={packKey}
        setCode={selectedSet.code}
        setName={selectedSet.name}
        startedAt={null}
        packCards={packCards}
        packNumber={1}
        pickInPack={1}
        totalCardsInPack={packCards.length}
        passDirection="left"
        timerSeconds={0}
        timerMaxSeconds={0}
        picks={[]}
        onPick={() => {}}
        filterSet={new Set()}
        onFilterToggle={() => {}}
        podMembers={[]}
        crackAPack
        crackAPackLabel={selectedProduct ? getDisplayName(selectedProduct, selectedSet.name) : undefined}
        onCrackAnother={handleCrackAnother}
        onBackToSetPicker={handleBackToSetPicker}
        crackAPackLoading={isPending}
      />
    );
  }

  // Set selection view
  return (
    <div className="mx-auto max-w-md px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold text-center">Crack a Pack</h1>
      <p className="text-sm text-foreground/50 text-center">
        Pick a set and open a booster pack to browse the cards.
      </p>

      <div className="space-y-4">
        <SetPicker key={packKey} value={selectedSet} onChange={handleSetChange} />

        {/* Booster type picker — only shown when multiple products exist */}
        {selectedSet && boosterProducts.length > 1 && (
          <div className="flex flex-wrap gap-2 justify-center">
            {boosterProducts.map((product) => (
              <button
                key={product.code}
                type="button"
                onClick={() => setSelectedProduct(product)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedProduct?.code === product.code
                    ? "bg-accent text-white"
                    : "bg-card text-foreground/70 hover:bg-card-hover"
                }`}
              >
                {getDisplayName(product, selectedSet.name)}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}

        <button
          type="button"
          onClick={handleCrack}
          disabled={!selectedSet || isPending || loadingProducts}
          className="block w-full rounded-lg bg-accent px-3 py-3 text-sm font-bold text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? "Opening pack..." : loadingProducts ? "Loading..." : "Crack it!"}
        </button>
      </div>
    </div>
  );
}
