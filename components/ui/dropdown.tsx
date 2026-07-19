"use client";

import { cn } from "@/lib/utils";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, X } from "lucide-react";
import * as React from "react";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Tag } from "./tag";

// Searchable single/multi-select combobox — not part of shadcn's registry,
// custom-built (ported from the POC this toolkit was generalized from,
// de-branded to the standard semantic tokens everything else uses).
export type DropdownOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type DropdownBaseProps = {
  options: DropdownOption[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

type DropdownSingleProps = DropdownBaseProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
};

type DropdownMultipleProps = DropdownBaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

export type DropdownProps = DropdownSingleProps | DropdownMultipleProps;

const Dropdown: React.FC<DropdownProps> = (props) => {
  const {
    options,
    placeholder = "Select...",
    searchable = true,
    searchPlaceholder = "Search...",
    disabled = false,
    className,
    "aria-label": ariaLabel,
  } = props;

  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const listboxId = React.useId();

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const query = search.toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(query),
    );
  }, [options, search]);

  const selectedValues = props.multiple
    ? props.value
    : props.value !== null
      ? [props.value]
      : [];

  const isSelected = (value: string) => selectedValues.includes(value);

  const selectOption = (option: DropdownOption) => {
    if (option.disabled) return;

    if (props.multiple) {
      const next = isSelected(option.value)
        ? props.value.filter((v) => v !== option.value)
        : [...props.value, option.value];
      props.onChange(next);
    } else {
      props.onChange(option.value);
      setOpen(false);
      setSearch("");
    }
  };

  const removeValue = (value: string) => {
    if (props.multiple) {
      props.onChange(props.value.filter((v) => v !== value));
    } else {
      props.onChange(null);
    }
  };

  const clearAll = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (props.multiple) {
      props.onChange([]);
    } else {
      props.onChange(null);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (disabled) return;
    setOpen(next);
    if (!next) setSearch("");
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") return;
    const firstMatch = filteredOptions.find((option) => !option.disabled);
    if (firstMatch) {
      event.preventDefault();
      selectOption(firstMatch);
    }
  };

  const hasValue = props.multiple
    ? props.value.length > 0
    : props.value !== null;

  const selectedOptionsForDisplay = selectedValues
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is DropdownOption => Boolean(option));

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={ariaLabel ?? (hasValue ? undefined : placeholder)}
          disabled={disabled}
          className={cn(
            "border-input dark:bg-input/30 flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-3 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          {props.multiple && selectedOptionsForDisplay.length > 0 ? (
            <span className="flex flex-1 flex-wrap items-center gap-1.5">
              {selectedOptionsForDisplay.map((option) => (
                <Tag
                  key={option.value}
                  onRemove={() => removeValue(option.value)}
                  onClick={(event) => event.stopPropagation()}
                >
                  {option.label}
                </Tag>
              ))}
            </span>
          ) : (
            <span
              className={cn(
                "flex-1 truncate text-left",
                !hasValue && "text-muted-foreground",
              )}
            >
              {!props.multiple && props.value !== null
                ? (options.find((option) => option.value === props.value)
                    ?.label ?? placeholder)
                : placeholder}
            </span>
          )}

          {hasValue && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear selection"
              onClick={clearAll}
              className="text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="dropdown-content"
          align="start"
          sideOffset={4}
          className="bg-popover text-popover-foreground z-50 min-w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md border p-1 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {searchable && (
            <div className="p-1">
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-8"
              />
            </div>
          )}

          <div
            id={listboxId}
            role="listbox"
            className="max-h-64 overflow-y-auto p-1"
          >
            {filteredOptions.length === 0 ? (
              <div className="text-muted-foreground px-2 py-1.5 text-sm">
                No results
              </div>
            ) : (
              filteredOptions.map((option) => {
                const selected = isSelected(option.value);
                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled}
                    onClick={() => selectOption(option)}
                    className={cn(
                      "relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm whitespace-nowrap outline-none transition-colors select-none",
                      option.disabled
                        ? "pointer-events-none opacity-50"
                        : "hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {props.multiple ? (
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => selectOption(option)}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                    ) : null}
                    <span className="flex-1 truncate">{option.label}</span>
                    {!props.multiple && selected && (
                      <Check className="size-4 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

export { Dropdown };
