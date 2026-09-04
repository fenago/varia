import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/** The four "+" registration marks every blueprint object wears. */
export function Corners() {
  return (
    <>
      <i className="corner tl" aria-hidden="true" />
      <i className="corner tr" aria-hidden="true" />
      <i className="corner bl" aria-hidden="true" />
      <i className="corner br" aria-hidden="true" />
    </>
  );
}

type BlueprintProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/**
 * A wireframe object: `.blueprint` + corner marks. Renders a `div` by default;
 * pass `as="section" | "button" | "label" | "a"` etc.
 */
export function Blueprint<T extends ElementType = "div">({
  as,
  className,
  children,
  ...rest
}: BlueprintProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={["blueprint", className].filter(Boolean).join(" ")} {...rest}>
      <Corners />
      {children}
    </Tag>
  );
}

interface BlueprintButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** `btn-primary` (solid accent). Default true. */
  primary?: boolean;
  /** `btn-block` full-width */
  block?: boolean;
}

/** The solid primary button, framed as a blueprint object (mockup: `btn btn-primary blueprint`). */
export function BlueprintButton({
  primary = true,
  block = false,
  className,
  children,
  type = "button",
  ...rest
}: BlueprintButtonProps) {
  const cls = ["btn", primary ? "btn-primary" : "btn-secondary", block ? "btn-block" : "", "blueprint", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      <Corners />
      {children}
    </button>
  );
}
