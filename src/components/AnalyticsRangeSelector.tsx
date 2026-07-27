import type { AnalyticsRange } from "../lib/analytics/types";
import { useTranslation } from "../lib/i18n";
import { ANALYTICS_RANGE_OPTIONS } from "../lib/playerAnalyticsView";
import { SegmentedControl } from "./SegmentedControl";

interface AnalyticsRangeSelectorProps {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
}

/** 7d/30d/90d/1y/all toggle shared by every analytics screen -- translated, RTL-safe, and accessible via SegmentedControl. */
export function AnalyticsRangeSelector({ value, onChange }: AnalyticsRangeSelectorProps) {
  const { t } = useTranslation();
  const options = ANALYTICS_RANGE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }));
  return <SegmentedControl options={options} value={value} onChange={onChange} />;
}
