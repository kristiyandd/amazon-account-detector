import { useEffect, useRef } from "preact/hooks";
import {
  EXPECTED_ACCOUNT,
  EXPECTED_ACCOUNT_SUFFIX,
  EXPECTED_MISSING,
  WRONG_ACCOUNT,
} from "@/core/copy";
import type { MatchStatus } from "@/core/expected";
import type { Marketplace } from "@/core/marketplaces";
import type { ExpectedEntry } from "@/core/state";
import type { StatusView } from "@/core/view";
import { CopyButton } from "./CopyButton";
import { ALERT_ICON, TICK_ICON } from "./icons";
import type { JSX, RefObject } from "preact";

export type PinFocus = "remove" | "heading" | null;

interface AccountCardProps {
  readonly marketplace: Marketplace;
  readonly view: StatusView;
  readonly match: MatchStatus;
  readonly expected: ExpectedEntry | undefined;
  readonly notice: string | null;
  readonly pinFocus: PinFocus;
  readonly canPin: boolean;
  readonly onSetExpected: () => void;
  readonly onClearExpected: () => void;
  readonly onPinFocused: () => void;
}

interface AlertProps {
  readonly marketplace: Marketplace;
  readonly email: string | null;
  readonly hint: string;
}

function WrongAccountAlert({ marketplace, email, hint }: AlertProps): JSX.Element {
  const label = marketplace.label;
  return (
    <p class="alert" role="alert">
      {ALERT_ICON}
      <span>
        <strong>{WRONG_ACCOUNT}</strong>
        Signed in as <b>{email}</b>, but {label} should use <b>{hint}</b>. Switch accounts on{" "}
        {label} before you place an order.
      </span>
    </p>
  );
}

function MissingAccountAlert({ marketplace, hint }: AlertProps): JSX.Element {
  const label = marketplace.label;
  return (
    <p class="alert" role="alert">
      {ALERT_ICON}
      <span>
        <strong>{EXPECTED_MISSING}</strong>
        {label} should use <b>{hint}</b>. Sign in on {label} before you place an order.
      </span>
    </p>
  );
}

function MatchAlert({ props }: { readonly props: AccountCardProps }): JSX.Element | null {
  const hint = props.expected?.hint;
  if (hint === undefined) {
    return null;
  }
  const alert = { marketplace: props.marketplace, email: props.view.email, hint };
  if (props.match === "mismatch") {
    return <WrongAccountAlert {...alert} />;
  }
  return props.match === "missing" ? <MissingAccountAlert {...alert} /> : null;
}

function Pills({
  view,
  match,
}: {
  readonly view: StatusView;
  readonly match: MatchStatus;
}): JSX.Element | null {
  const { pill } = view;
  if (pill === null || match === "mismatch") {
    return null;
  }
  return (
    <div class="pills">
      <span class={`pill ${pill.tone}`}>{pill.text}</span>
      {match === "match" ? (
        <span class="pill flag">
          {TICK_ICON}
          {EXPECTED_ACCOUNT}
        </span>
      ) : null}
    </div>
  );
}

function useFocusWhen<T extends HTMLElement>(focus: boolean, onFocused: () => void): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (focus) {
      ref.current?.focus();
      onFocused();
    }
  }, [focus, onFocused]);
  return ref;
}

interface FocusProps {
  readonly focus: boolean;
  readonly onFocused: () => void;
}

interface WhoProps extends FocusProps {
  readonly email: string;
  readonly detail: string | null;
  readonly wrong: boolean;
}

function Who({ email, detail, wrong, focus, onFocused }: WhoProps): JSX.Element {
  const ref = useFocusWhen<HTMLParagraphElement>(focus, onFocused);
  return (
    <div class="who">
      <span class={wrong ? "avatar bad" : "avatar"} aria-hidden="true">
        {email.slice(0, 1).toUpperCase()}
      </span>
      <div>
        <p ref={ref} class="email" tabIndex={-1}>
          {email}
        </p>
        {detail === null ? null : <p class="since">{detail}</p>}
      </div>
      <CopyButton email={email} />
    </div>
  );
}

interface HeadlineProps extends FocusProps {
  readonly view: StatusView;
}

function Headline({ view, focus, onFocused }: HeadlineProps): JSX.Element {
  const ref = useFocusWhen<HTMLParagraphElement>(focus, onFocused);
  return (
    <div>
      {view.pill === null ? (
        <p ref={ref} class="headline" tabIndex={-1}>
          {view.headline}
        </p>
      ) : (
        <p ref={ref} tabIndex={-1}>
          {view.headline}
        </p>
      )}
      {view.detail === null || view.detail === view.headline ? null : (
        <p class="since">{view.detail}</p>
      )}
    </div>
  );
}

interface PinButtonProps extends FocusProps {
  readonly label: string;
  readonly onClick: () => void;
}

function PinButton({ label, focus, onClick, onFocused }: PinButtonProps): JSX.Element {
  const ref = useFocusWhen<HTMLButtonElement>(focus, onFocused);
  return (
    <button ref={ref} type="button" class="link-btn" onClick={onClick}>
      {label}
    </button>
  );
}

function Pin({ props }: { readonly props: AccountCardProps }): JSX.Element | null {
  if (props.match === "mismatch") {
    return null;
  }
  if (props.expected !== undefined) {
    return (
      <div class="pin set">
        <span>You will be warned if another account signs in here.</span>
        <PinButton
          key="remove"
          label="Remove"
          focus={props.pinFocus === "remove"}
          onClick={props.onClearExpected}
          onFocused={props.onPinFocused}
        />
      </div>
    );
  }
  return props.view.email === null || !props.canPin ? null : (
    <div class="pin">
      <span>{`Warn me if ${props.marketplace.label} is ever signed in with a different account.`}</span>
      <PinButton
        key="set"
        label="Set as expected"
        focus={false}
        onClick={props.onSetExpected}
        onFocused={props.onPinFocused}
      />
    </div>
  );
}

function verdictOf(view: StatusView, match: MatchStatus): string {
  if (view.email === null) {
    return view.headline;
  }
  const label = match === "mismatch" ? WRONG_ACCOUNT : (view.pill?.text ?? view.headline);
  const flag = match === "match" ? EXPECTED_ACCOUNT_SUFFIX : "";
  return `${label}: ${view.email}${flag}`;
}

function LiveStatus({ props }: { readonly props: AccountCardProps }): JSX.Element {
  return (
    <p class="sr-only" role="status" aria-live="polite">
      <span>{verdictOf(props.view, props.match)}</span>
      {props.notice === null ? null : <span>{` ${props.notice}`}</span>}
    </p>
  );
}

export function AccountCard(props: AccountCardProps): JSX.Element {
  const { view, match } = props;
  const headingFocus = props.pinFocus === "heading";
  return (
    <div class="verdict">
      <LiveStatus props={props} />
      <MatchAlert props={props} />
      <Pills view={view} match={match} />
      {view.email === null ? (
        <Headline view={view} focus={headingFocus} onFocused={props.onPinFocused} />
      ) : (
        <Who
          email={view.email}
          detail={view.detail}
          wrong={match === "mismatch"}
          focus={headingFocus}
          onFocused={props.onPinFocused}
        />
      )}
      {view.staleWarning === null ? null : <p class="note warn">{view.staleWarning}</p>}
      {view.link === null ? null : (
        <a class="link" href={view.link.href} target="_blank" rel="noopener noreferrer">
          {view.link.text}
        </a>
      )}
      <Pin props={props} />
    </div>
  );
}
