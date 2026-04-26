type SellOrderItem = {
  id: string;
  category: string;
  kind: string;
  name: string;
  owner: string;
  priority: number;
  value: number;
  note: string;
};

type Props = {
  sell_order_items: SellOrderItem[];
  person_label_by_id: Map<string, string>;
};

/**
 * SellOrderForm — displays the withdrawal order summary.
 * Shows assets and properties sorted by withdrawal priority.
 */
export function SellOrderForm({ sell_order_items }: Props) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="text-sm font-semibold">Sell Order Summary</div>
      <div className="mt-2 text-xs text-slate-400">
        Higher priority numbers are sold first. This combines financial assets and buy-to-let properties into one live withdrawal order.
      </div>

      <div className="mt-3 rounded border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-200/90">
        <div className="font-medium text-amber-100">First To Sell to Last To Sell</div>
        <div className="mt-1 text-xs">
          Use this tab as a quick check that your configured priorities match the order you want the simulation to use.
        </div>
      </div>

      {sell_order_items.length === 0 ? (
        <div className="mt-4 rounded border border-slate-800 bg-slate-950/30 p-4 text-sm text-slate-400">
          No assets or properties configured yet.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {sell_order_items.map((item, index) => (
            <div
              key={item.id}
              className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950/30 p-3 md:grid-cols-[80px_120px_minmax(0,1fr)_140px_120px_140px]"
            >
              <div>
                <div className="text-xs text-slate-400">Order</div>
                <div className="text-sm font-semibold text-slate-100">{index + 1}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Category</div>
                <div className="text-sm text-slate-200">{item.category}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Name</div>
                <div className="text-sm font-medium text-slate-100">{item.name}</div>
                <div className="mt-1 text-xs text-slate-400">{item.kind}</div>
                {item.note && <div className="mt-1 text-xs text-slate-500">{item.note}</div>}
              </div>
              <div>
                <div className="text-xs text-slate-400">Owner</div>
                <div className="text-sm text-slate-200">{item.owner}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Priority</div>
                <div className="text-sm font-semibold text-amber-300">{item.priority}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Current value</div>
                <div className="text-sm text-slate-200">£{item.value.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
