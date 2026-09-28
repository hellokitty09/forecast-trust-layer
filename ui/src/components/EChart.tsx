import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart, ScatterChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, MarkAreaComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([LineChart, ScatterChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, MarkAreaComponent, SVGRenderer]);

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Base axis/text styling that follows the page theme tokens. */
export function themedBase(): EChartsCoreOption {
  const ink2 = cssVar("--ink-2"), line = cssVar("--line");
  const axis = { axisLine: { lineStyle: { color: line } }, axisLabel: { color: ink2 }, splitLine: { lineStyle: { color: line, type: "dashed" } }, nameTextStyle: { color: ink2 } };
  return {
    textStyle: { fontFamily: "ui-sans-serif, system-ui, sans-serif" },
    grid: { left: 52, right: 20, top: 36, bottom: 44 },
    tooltip: { trigger: "axis", backgroundColor: cssVar("--surface"), borderColor: line, textStyle: { color: cssVar("--ink") } },
    legend: { top: 0, textStyle: { color: ink2 } },
    xAxis: axis,
    yAxis: axis,
  };
}

export function EChart({ option, height = 320 }: { option: EChartsCoreOption; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "svg" });
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);

  return <div ref={el} style={{ width: "100%", height }} />;
}
