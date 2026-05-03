export default function TimeChart() {
  return (
    <div>
      <h3 className="text-sm font-medium mb-1">Command Time Required (on sync mode)</h3>
      <canvas id="chart" className="border border-border" width="480" height="100"></canvas>
    </div>
  );
}
