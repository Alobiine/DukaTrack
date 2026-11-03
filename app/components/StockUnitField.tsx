import { useState } from "react";
import { stockUnits } from "../../lib/units";
import { Field } from "./primitives";

export function StockUnitField({ unit = "Pieces" }: { unit?: string }) {
  const [selection, setSelection] = useState(
    stockUnits.some((option) => option === unit) ? unit : "other",
  );
  return (
    <>
      <label className="field">
        Unit
        <select
          name="unit"
          value={selection}
          onChange={(event) => setSelection(event.target.value)}
          required
        >
          {stockUnits.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
          <option value="other">Other (type your own)</option>
        </select>
      </label>
      {selection === "other" && (
        <Field
          label="Custom unit"
          name="customUnit"
          defaultValue={stockUnits.some((option) => option === unit) ? "" : unit}
          placeholder="e.g. Buckets"
          maxLength={60}
          pattern=".*\\S.*"
          required
        />
      )}
    </>
  );
}
