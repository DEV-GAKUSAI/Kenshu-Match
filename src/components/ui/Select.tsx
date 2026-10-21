"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * Kenshu Link dropdown. Drop-in for <select>: same props (value, onChange, id, name, required,
 * disabled, aria-label, className, style) and <option> children. Only the open list is custom;
 * a hidden native <select> keeps `required` and form values working.
 */

type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode };
type Opt = { value: string; label: ReactNode; text: string; disabled: boolean };

export type SelectChange = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

type Props = {
  value?: string | number;
  onChange?: (e: SelectChange) => void;
  children?: ReactNode;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode, out: Opt[]) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      collect((child.props as { children?: ReactNode }).children, out);
      return;
    }
    if (child.type === "option") {
      const p = (child as ReactElement<OptionProps>).props;
      const text = textOf(p.children);
      out.push({ value: p.value === undefined ? text : String(p.value), label: p.children, text, disabled: !!p.disabled });
    }
  });
}

export function Select({ value, onChange, children, id, name, required, disabled, className, style, "aria-label": ariaLabel }: Props) {
  const options = useMemo(() => {
    const out: Opt[] = [];
    collect(children, out);
    return out;
  }, [children]);

  const current = value === undefined || value === null ? "" : String(value);
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openList() {
    if (disabled) return;
    const r = root.current?.getBoundingClientRect();
    if (r) setDropUp(window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom);
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    setOpen(true);
  }

  function choose(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    setOpen(false);
    if (o.value !== current) onChange?.({ target: { value: o.value, name }, currentTarget: { value: o.value, name } });
  }

  function step(from: number, dir: 1 | -1) {
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) return i;
    }
    return from;
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => step(a, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => step(a, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(step(-1, 1));
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(step(options.length, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className={`ksel${className ? ` ${className}` : ""}${open ? " is-open" : ""}`} style={style}>
      <button
        type="button"
        id={id}
        className="ksel__btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        <span className="ksel__text">{selected ? selected.label : " "}</span>
      </button>
      {open && (
        <div ref={list} id={listId} role="listbox" className={`ksel__panel${dropUp ? " is-up" : ""}`}>
          {options.map((o, i) => (
            <div
              key={`${o.value}-${i}`}
              data-i={i}
              role="option"
              aria-selected={o.value === current}
              aria-disabled={o.disabled || undefined}
              className={`ksel__opt${o.value === current ? " is-selected" : ""}${i === active ? " is-active" : ""}${o.disabled ? " is-disabled" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span>{o.label}</span>
            </div>
          ))}
        </div>
      )}
      <select className="ksel__native" tabIndex={-1} aria-hidden="true" value={current} name={name} required={required} disabled={disabled} onChange={() => {}}>
        {options.map((o, i) => (
          <option key={`${o.value}-${i}`} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </div>
  );
}
