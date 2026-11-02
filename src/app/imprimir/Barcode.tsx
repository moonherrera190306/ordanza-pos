"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function Barcode({ value, height = 40, fontSize = 12, width = 1.6, displayValue = true }: {
  value: string; height?: number; fontSize?: number; width?: number; displayValue?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", height, fontSize, width, margin: 0, displayValue, background: "#ffffff", lineColor: "#000000" });
    } catch {}
  }, [value, height, fontSize, width, displayValue]);
  return <svg ref={ref} />;
}
