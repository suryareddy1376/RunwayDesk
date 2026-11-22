import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CaretDown,
  CheckCircle,
  Clock,
  Code,
  List,
  Shield,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useAuth } from "../context/AuthContext";

/* ------------------------------------------------------------------ */
/* Shared class tokens                                                  */
/* ------------------------------------------------------------------ */

const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";
const MOTION = "motion-reduce:transition-none motion-reduce:transform-none";
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2";

const PRIMARY = `inline-flex items-center gap-2 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition duration-300 ${EASE} hover:bg-neutral-700 active:scale-[0.98] ${FOCUS} ${MOTION}`;
const SECONDARY = `inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition duration-300 ${EASE} hover:bg-neutral-50 active:scale-[0.98] ${FOCUS} ${MOTION}`;
const TEXT_LINK = `rounded-md px-2 py-2 text-sm text-neutral-700 transition duration-300 ${EASE} hover:text-neutral-900 hover:underline active:scale-[0.98] ${FOCUS} ${MOTION}`;
const BRAND = `rounded-md px-2 py-2 text-base font-semibold text-neutral-900 transition duration-300 ${EASE} hover:underline active:scale-[0.98] ${FOCUS} ${MOTION}`;

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#benefits", label: "Benefits" },
  { href: "#faq", label: "FAQ" },
];

/* ------------------------------------------------------------------ */
/* useInView: one IntersectionObserver helper, reveals once             */
/* ------------------------------------------------------------------ */

function useInView<T extends Element>(rootMargin = "0px", threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin, threshold]);

  return { ref, inView };
}

function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition duration-700 ${EASE} ${MOTION} ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forecast chart data (30 points, viewBox 300 x 120)                   */
/* ------------------------------------------------------------------ */

const CHART_W = 300;
const CHART_H = 120;

const toPoints = (fn: (i: number) => number) =>
  Array.from({ length: 30 }, (_, i) => `${((i * CHART_W) / 29).toFixed(1)},${fn(i).toFixed(1)}`).join(" ");

const baselineCurve = (i: number) => 96 - i * 1.4 + 5 * Math.sin(i / 2.5);
const lateCurve = (i: number) => baselineCurve(i) + 18 * Math.exp(-((i - 18) ** 2) / 20);
const recoveredCurve = (i: number) =>
  baselineCurve(i) - 12 * Math.min(1, Math.max(0, (i - 8) / 10));

const SCENARIOS = [
  {
    id: "baseline",
    label: "Baseline",
    figure: "+₹92,500",
    figureTone: "text-emerald-600",
    stroke: "stroke-neutral-900",
    points: toPoints(baselineCurve),
  },
  {
    id: "late",
    label: "Client 15d late",
    figure: "\u2212₹2,500",
    figureTone: "text-rose-600",
    stroke: "stroke-rose-500",
    points: toPoints(lateCurve),
  },
  {
    id: "recovered",
    label: "INV 104 recovered",
    figure: "+₹52,500",
    figureTone: "text-emerald-600",
    stroke: "stroke-emerald-600",
    points: toPoints(recoveredCurve),
  },
] as const;

function ForecastCard() {
  const [active, setActive] = useState(0);
  const scenario = SCENARIOS[active];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-neutral-900">Day 19 forecast</p>
        <p className="text-xs text-neutral-600">30 point balance view</p>
      </div>

      <p
        aria-live="polite"
        className={`mt-4 font-mono text-3xl font-semibold tabular-nums transition duration-300 ${EASE} ${MOTION} ${scenario.figureTone}`}
      >
        {scenario.figure}
      </p>

      <div className="relative mt-6 h-40 w-full">
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <line
            x1="0"
            x2={CHART_W}
            y1="70"
            y2="70"
            className="stroke-amber-500"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="0"
            x2={CHART_W}
            y1="112"
            y2="112"
            className="stroke-rose-500"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {SCENARIOS.map((s, i) => (
          <svg
            key={s.id}
            aria-hidden="true"
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            className={`absolute inset-0 h-full w-full transition duration-500 ${EASE} ${MOTION} ${
              i === active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
            }`}
          >
            <polyline
              points={s.points}
              fill="none"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className={s.stroke}
            />
          </svg>
        ))}
      </div>

      <ul className="mt-4 flex flex-wrap gap-4 text-xs text-neutral-600">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-amber-500" />
          Safe buffer
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-rose-500" />
          ₹0 Danger line
        </li>
      </ul>

      <div role="group" aria-label="Forecast scenario" className="mt-6 flex flex-wrap gap-2">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={i === active}
            onClick={() => setActive(i)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition duration-300 ${EASE} active:scale-[0.98] ${FOCUS} ${MOTION} ${
              i === active
                ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-700"
                : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation                                                           */
/* ------------------------------------------------------------------ */

function SiteNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const cta = signedIn
    ? { to: "/dashboard", label: "Open dashboard" }
    : { to: "/login", label: "Log in" };

  return (
    <header className="sticky top-0 z-50 px-4 pt-4 md:fixed md:inset-x-0 md:top-4">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-4xl items-center justify-between rounded-xl border border-neutral-200 bg-white/80 px-4 py-2 backdrop-blur-md"
      >
        <Link to="/" className={BRAND}>
          RunwayDesk
        </Link>

        <ul className="hidden items-center gap-2 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} className={TEXT_LINK}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link to={cta.to} className={`${SECONDARY} hidden md:inline-flex`}>
            {cta.label}
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            className={`${SECONDARY} md:hidden`}
          >
            {open ? <X size={20} aria-hidden /> : <List size={20} aria-hidden />}
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        className={`fixed inset-0 z-40 flex flex-col gap-2 bg-white px-4 pb-8 pt-24 transition-opacity duration-300 ${EASE} ${MOTION} md:hidden ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        {NAV_LINKS.map((link, i) => (
          <a
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            style={{ transitionDelay: open ? `${Math.min(i * 60, 400)}ms` : "0ms" }}
            className={`rounded-md px-2 py-2 text-lg text-neutral-900 transition duration-500 ${EASE} ${MOTION} active:scale-[0.98] ${FOCUS} ${
              open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
            }`}
          >
            {link.label}
          </a>
        ))}
        <Link
          to={cta.to}
          onClick={() => setOpen(false)}
          style={{ transitionDelay: open ? `${Math.min(NAV_LINKS.length * 60, 400)}ms` : "0ms" }}
          className={`${PRIMARY} mt-4 self-start transition duration-500 ${EASE} ${
            open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          {cta.label}
        </Link>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Problem to solution                                                  */
/* ------------------------------------------------------------------ */

function ProblemSection() {
  return (
    <section id="problem" aria-labelledby="problem-heading" className="mx-auto max-w-6xl px-4 py-24">
      <Reveal>
        <h2 id="problem-heading" className="text-3xl font-semibold tracking-tight text-neutral-900">
          Two ways to read the same month
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <Reveal>
          <article className="flex h-full flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-neutral-900">Today</h3>
            <p className="text-sm text-neutral-600">
              Backward looking spreadsheets and WhatsApp threads
            </p>
            <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              <WarningCircle size={14} aria-hidden />
              3 overdue invoices
            </span>
          </article>
        </Reveal>

        <Reveal>
          <article className="flex h-full flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-neutral-900">With RunwayDesk</h3>
            <p className="text-sm text-neutral-600">A forward looking command center</p>
            <svg
              aria-hidden="true"
              viewBox="0 0 120 40"
              preserveAspectRatio="none"
              className="h-10 w-full"
            >
              <polyline
                points="0,30 20,26 40,28 60,18 80,22 100,30 120,36"
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-neutral-900"
              />
            </svg>
            <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
              <Clock size={14} aria-hidden />
              Day 19 shortfall flagged
            </span>
          </article>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tagline reveal: one IntersectionObserver per word                    */
/* ------------------------------------------------------------------ */

const TAGLINE_WORDS =
  "Solo studios do not fail from a lack of clients. They fail when one invoice slips while fixed bills clear on time.".split(
    " ",
  );

function TaglineWord({ word, index }: { word: string; index: number }) {
  // Trigger line sits at 60 percent of the viewport height.
  const { ref, inView } = useInView<HTMLSpanElement>("0px 0px -40% 0px", 0);
  return (
    <>
      <span
        ref={ref}
        style={{ transitionDelay: `${Math.min(index * 20, 400)}ms` }}
        className={`inline-block transition-opacity duration-500 ${EASE} motion-reduce:transition-none ${
          inView ? "opacity-100" : "opacity-[0.3]"
        }`}
      >
        {word}
      </span>{" "}
    </>
  );
}

function TaglineSection() {
  return (
    <section aria-labelledby="tagline-heading" className="px-4 py-24">
      <h2
        id="tagline-heading"
        style={{ textWrap: "balance" } as CSSProperties}
        className="mx-auto max-w-[680px] text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl"
      >
        {TAGLINE_WORDS.map((word, i) => (
          <TaglineWord key={`${word}-${i}`} word={word} index={i} />
        ))}
      </h2>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Benefits and micro graphics                                          */
/* ------------------------------------------------------------------ */

function CurveGraphic() {
  return (
    <div className="relative h-24 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
      <svg aria-hidden="true" viewBox="0 0 200 80" preserveAspectRatio="none" className="h-full w-full">
        <line
          x1="0"
          x2="200"
          y1="50"
          y2="50"
          className="stroke-amber-500"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points="0,20 25,26 50,30 75,38 100,44 125,52 150,58 175,62 200,66"
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-neutral-900"
        />
      </svg>
      <span className="absolute right-2 top-2 rounded-md border border-rose-200 bg-white px-2 py-0.5 text-xs font-medium text-rose-700">
        Day 19
      </span>
    </div>
  );
}

const TONES = [
  {
    name: "Friendly",
    text: "Hi Asha, a quick note that invoice 104 is still open. Could you share a payment date when you get a moment?",
  },
  {
    name: "Firm",
    text: "Hi Asha, invoice 104 is now 9 days past due. Please confirm a payment date by Friday.",
  },
  {
    name: "Final",
    text: "Asha, invoice 104 is 20 days overdue. Payment is needed by Friday, or we will have to pause work until it clears.",
  },
];

function ToneGraphic() {
  const [tone, setTone] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Reminder tone" className="flex flex-wrap gap-2">
        {TONES.map((t, i) => (
          <button
            key={t.name}
            type="button"
            aria-pressed={i === tone}
            onClick={() => setTone(i)}
            className={`rounded-md border px-2 py-0.5 text-xs font-medium transition duration-300 ${EASE} active:scale-[0.98] ${FOCUS} ${MOTION} ${
              i === tone
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
        {TONES[tone].text}
      </p>
    </div>
  );
}

function QuickAddGraphic() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700"
      >
        <span>Bill Figma 3500 due in 5 days</span>
        <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">Add</span>
      </div>
      <div ref={ref}>
        <span
          className={`inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-900 transition duration-500 ${EASE} ${MOTION} ${
            inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
          }`}
        >
          Bill, Figma, ₹3,500, due in 5 days
        </span>
      </div>
    </div>
  );
}

function PriorityGraphic() {
  const [sent, setSent] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <p className="text-sm font-medium text-neutral-900">INV 104, ₹55,000, overdue</p>
      <button
        type="button"
        onClick={() => setSent(true)}
        className={`${PRIMARY} shrink-0`}
      >
        {sent ? "Reminder sent" : "Send reminder"}
      </button>
    </div>
  );
}

function BenefitCard({ title, outcome, children }: { title: string; outcome: string; children: ReactNode }) {
  return (
    <Reveal>
      <article className="flex h-full flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
          <p className="text-sm text-neutral-600">{outcome}</p>
        </div>
        <div className="mt-auto">{children}</div>
      </article>
    </Reveal>
  );
}

function BenefitsSection() {
  return (
    <section id="benefits" aria-labelledby="benefits-heading" className="mx-auto max-w-6xl px-4 py-24">
      <Reveal>
        <h2 id="benefits-heading" className="text-3xl font-semibold tracking-tight text-neutral-900">
          Everything you need to protect runway
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <BenefitCard
          title="Spot shortfalls early"
          outcome="See the day your balance dips below the buffer, with weeks to act."
        >
          <CurveGraphic />
        </BenefitCard>
        <BenefitCard
          title="Chase without awkwardness"
          outcome="Pick a reminder tone that fits the client, from friendly to final."
        >
          <ToneGraphic />
        </BenefitCard>
        <BenefitCard
          title="Log records in five seconds"
          outcome="Type one line and the bill, amount, and due date are filled in."
        >
          <QuickAddGraphic />
        </BenefitCard>
        <BenefitCard
          title="Every risk paired with action"
          outcome="Each overdue invoice comes with the next action attached."
        >
          <PriorityGraphic />
        </BenefitCard>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works, proof strip, FAQ                                       */
/* ------------------------------------------------------------------ */

const STEPS = [
  "Log invoices and fixed bills in one line",
  "Stress test late client payments on a 30 to 90 day chart",
  "Send one click reminders and watch your runway recover",
];

function HowItWorksSection() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 py-24">
      <Reveal>
        <h2 id="how-heading" className="text-3xl font-semibold tracking-tight text-neutral-900">
          How it works
        </h2>
      </Reveal>
      <ol className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step}>
            <li className="flex h-full flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 font-mono text-sm tabular-nums text-neutral-900">
                {i + 1}
              </span>
              <h3 className="text-xl font-semibold text-neutral-900">{step}</h3>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

const PROOF = [
  { icon: Shield, text: "Multi tenant Auth and Postgres RLS" },
  { icon: Code, text: "Pure TypeScript financial engine" },
  { icon: CheckCircle, text: "30 passing automated unit tests" },
];

function ProofStrip() {
  return (
    <section aria-label="Production proof" className="mx-auto max-w-6xl px-4 py-24">
      <ul className="grid gap-4 md:grid-cols-3">
        {PROOF.map(({ icon: Icon, text }) => (
          <Reveal key={text}>
            <li className="flex h-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-6 text-sm font-medium text-neutral-900">
              <Icon size={20} aria-hidden />
              {text}
            </li>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    q: "Why not just use Excel or Google Sheets?",
    a: "Spreadsheets show what happened. RunwayDesk projects your balance 90 days ahead and flags a shortfall before it happens, and it keeps invoice follow ups in the same place.",
  },
  {
    q: "My CA already handles my accounting. Do I still need this?",
    a: "Your CA closes the books. RunwayDesk answers a different question: will there be cash on the day a bill is due.",
  },
  {
    q: "How long does setup take?",
    a: "Start in the sandbox with no setup. For your own studio, add your open invoices and fixed bills, which takes one line each.",
  },
  {
    q: "Will payment reminders sound robotic to my clients?",
    a: "No. Reminders come in three tones, Friendly, Firm, and Final, and you choose which one to send.",
  },
  {
    q: "Is my studio financial data private?",
    a: "Each studio is isolated with Supabase Auth and Postgres Row Level Security, so one studio cannot read another studio's records.",
  },
  {
    q: "Can I try it before creating an account?",
    a: "Yes. The Launch studio sandbox button opens the sign in screen with a one click demo studio.",
  },
];

function FaqItem({
  question,
  answer,
  index,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const buttonId = `faq-question-${index}`;
  const panelId = `faq-panel-${index}`;
  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-6 py-4 text-left text-sm font-medium text-neutral-900 transition duration-300 ${EASE} hover:bg-neutral-50 active:scale-[0.98] ${FOCUS} ${MOTION}`}
        >
          {question}
          <CaretDown
            size={16}
            aria-hidden
            className={`shrink-0 transition-transform duration-300 ${EASE} motion-reduce:transition-none ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={`grid transition-[grid-template-rows] duration-500 ${EASE} motion-reduce:transition-none ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div
          className={`overflow-hidden min-h-0 transition-[visibility] duration-500 motion-reduce:transition-none ${
            isOpen ? "" : "invisible"
          }`}
        >
          <p className="px-6 pb-4 text-sm text-neutral-600">{answer}</p>
        </div>
      </div>
    </div>
  );
}

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <section id="faq" aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 py-24">
      <Reveal>
        <h2 id="faq-heading" className="text-3xl font-semibold tracking-tight text-neutral-900">
          Questions studios ask
        </h2>
      </Reveal>
      <div className="mt-12 flex flex-col gap-4">
        {FAQ_ITEMS.map((item, i) => (
          <Reveal key={item.q}>
            <FaqItem
              question={item.q}
              answer={item.a}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex((current) => (current === i ? null : i))}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ */
/* Legal dialog                                                         */
/* ------------------------------------------------------------------ */

const LEGAL = {
  privacy: {
    title: "Privacy Policy",
    body: "RunwayDesk stores the invoices, bills, and client records you enter so it can build your cash flow forecast. Each account is isolated with Postgres Row Level Security, so only your signed in account can read or change its own records. We never sell your studio data and do not share it with advertisers. The Launch Studio Sandbox uses placeholder data created for demonstration only, not your financial information.",
  },
  terms: {
    title: "Terms",
    body: "RunwayDesk is a cash flow planning tool for solo studios. Forecasts are estimates based on the figures you enter, so check them against your own bank records before you make decisions. You are responsible for the accuracy of your data and for keeping your sign in details safe. The Launch Studio Sandbox runs on placeholder data. Use the product lawfully and do not try to access another account's records.",
  },
} as const;

type LegalKey = keyof typeof LEGAL;

function LegalDialog({ doc, onClose }: { doc: LegalKey | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (doc && !dialog.open) dialog.showModal();
    if (!doc && dialog.open) dialog.close();
  }, [doc]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="legal-title"
      className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-neutral-900 backdrop:bg-neutral-900/40"
    >
      {doc && (
        <div>
          <h2 id="legal-title" className="text-xl font-semibold">
            {LEGAL[doc].title}
          </h2>
          <p className="mt-4 text-sm text-neutral-600">{LEGAL[doc].body}</p>
          <form method="dialog" className="mt-6 flex justify-end">
            <button type="submit" className={PRIMARY}>
              Close
            </button>
          </form>
        </div>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const { session } = useAuth();
  const signedIn = Boolean(session);

  const [legal, setLegal] = useState<LegalKey | null>(null);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <a
        href="#main"
        className={`sr-only rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-900 transition duration-300 ${EASE} hover:underline focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:ring-2 focus:ring-neutral-900 active:scale-[0.98] ${MOTION}`}
      >
        Skip to content
      </a>

      <SiteNav signedIn={signedIn} />

      <main id="main">
        <section
          aria-labelledby="hero-heading"
          className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-24 pt-8 md:grid-cols-2 md:pt-24"
        >
          <div>
            <h1
              id="hero-heading"
              style={{ textWrap: "balance" } as CSSProperties}
              className="max-w-[680px] bg-gradient-to-r from-black to-[#666666] bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-6xl"
            >
              See a cash crunch
              <br />
              three weeks before it hits
            </h1>
            <p className="mt-6 max-w-[680px] text-lg text-neutral-600">
              A cash flow command center for solo studios. Project your balance 90 days ahead, test late
              client payments, and chase overdue invoices in one click.
            </p>
            <div className="mt-8">
              <Link to="/login" className={PRIMARY}>
                Launch studio sandbox
                <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
            <p className="mt-3 text-sm text-neutral-600">
              Live multi tenant app. Test the full studio workspace with zero setup.
            </p>
          </div>

          <ForecastCard />
        </section>

        <ProblemSection />
        <TaglineSection />
        <BenefitsSection />
        <HowItWorksSection />
        <ProofStrip />
        <FaqSection />

        <section aria-label="Get started" className="mx-auto max-w-3xl px-4 py-24 text-center">
          <Reveal>
            <p className="text-lg text-neutral-700">
              Explore the pre loaded studio sandbox in 30 seconds with no credit card and no spreadsheet
              migration.
            </p>
            <div className="mt-8 flex justify-center">
              <Link to="/login" className={PRIMARY}>
                Launch studio sandbox
                <ArrowRight size={16} aria-hidden />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-neutral-600 md:flex-row">
        <p>© 2026 RunwayDesk</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setLegal("privacy")} className={TEXT_LINK}>
            Privacy Policy
          </button>
          <button type="button" onClick={() => setLegal("terms")} className={TEXT_LINK}>
            Terms
          </button>
        </div>
      </footer>

      <LegalDialog doc={legal} onClose={() => setLegal(null)} />
    </div>
  );
}
