type BondAllocations = {
  ISA: number;
  GIA: number;
  PENSION: number;
};

type Props = {
  currentAllocations: BondAllocations;
  onAllocationChange: (assetType: "ISA" | "GIA" | "PENSION", value: number) => void;
  isSaving?: boolean;
  saveError?: string | null;
  className?: string;
};

export function BondAllocationPanel({
  currentAllocations,
  onAllocationChange,
  isSaving = false,
  saveError = null,
  className = ""
}: Props) {
  const assetAllocations = currentAllocations;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Quick Bond Adjustment</h3>
          <p className="text-xs text-slate-500">Adjust allocations and recalculate instantly. Use Bond Optimiser for comprehensive analysis.</p>
        </div>
      </div>

      {saveError && (
        <div className="rounded border border-rose-800 bg-rose-950/30 px-4 py-2 text-sm text-rose-200">
          {saveError}
        </div>
      )}

      <div className="space-y-3">
        {/* ISA Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-400">ISA Bond %</label>
            <span className="text-xs font-mono text-blue-400">{Math.round(assetAllocations.ISA)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={assetAllocations.ISA}
              onChange={(e) => onAllocationChange("ISA", parseInt(e.target.value, 10))}
              className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-blue-500"
              disabled={isSaving}
            />
            <span className="text-[10px] text-slate-500">equity</span>
            <span className="text-[10px] text-slate-500">bonds</span>
          </div>
        </div>

        {/* GIA Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-400">GIA Bond %</label>
            <span className="text-xs font-mono text-green-400">{Math.round(assetAllocations.GIA)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={assetAllocations.GIA}
              onChange={(e) => onAllocationChange("GIA", parseInt(e.target.value, 10))}
              className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-green-500"
              disabled={isSaving}
            />
            <span className="text-[10px] text-slate-500">equity</span>
            <span className="text-[10px] text-slate-500">bonds</span>
          </div>
        </div>

        {/* Pension Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-400">Pension Bond %</label>
            <span className="text-xs font-mono text-purple-400">{Math.round(assetAllocations.PENSION)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={assetAllocations.PENSION}
              onChange={(e) => onAllocationChange("PENSION", parseInt(e.target.value, 10))}
              className="h-1.5 w-full flex-1 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-purple-500"
              disabled={isSaving}
            />
            <span className="text-[10px] text-slate-500">equity</span>
            <span className="text-[10px] text-slate-500">bonds</span>
          </div>
        </div>
      </div>
    </div>
  );
}
