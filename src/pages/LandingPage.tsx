import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MotionConfig, motion, AnimatePresence, useScroll, useTransform, type MotionValue } from "framer-motion";
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

const toPoints = (fn: (i: number) => number) =>
  Array.from({ length: 30 }, (_, i) => `${((i * CHART_W) / 29).toFixed(1)},${fn(i).toFixed(1)}`).join(" ");

/* Convert the 300x120 point list into 420x160 viewBox coordinates. */
const SVG_W = 420;
const SVG_H = 160;
const scalePoints = (points: string) =>
  points.split(" ").map((p) => {
    const [x, y] = p.split(",").map(Number);
    return [(x * SVG_W) / CHART_W, (y * SVG_H) / 120] as const;
  });
const toPathD = (points: string) =>
  scalePoints(points)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
const DAY_19_INDEX = 18;

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
    hex: "#059669",
    points: toPoints(baselineCurve),
  },
  {
    id: "late",
    label: "Client 15d late",
    figure: "\u2212₹2,500",
    figureTone: "text-rose-600",
    hex: "#e11d48",
    points: toPoints(lateCurve),
  },
  {
    id: "recovered",
    label: "INV 104 recovered",
    figure: "+₹52,500",
    figureTone: "text-emerald-600",
    hex: "#059669",
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

      <div className="relative mt-6 h-[180px] w-full">
        <svg viewBox="0 0 420 160" className="w-full h-full block" aria-hidden="true">
          <line
            x1="0"
            x2="420"
            y1="70"
            y2="70"
            stroke="#d97706"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <line x1="0" x2="420" y1="112" y2="112" stroke="#e11d48" strokeWidth="1.5" />
          <motion.path
            key={scenario.id}
            d={toPathD(scenario.points)}
            fill="none"
            stroke={scenario.hex}
            strokeWidth={2.5}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.circle
            r={5}
            fill={scenario.hex}
            animate={{
              cx: scalePoints(scenario.points)[DAY_19_INDEX][0],
              cy: scalePoints(scenario.points)[DAY_19_INDEX][1],
            }}
            transition={{ ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
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

const MotionLink = motion(Link);

function SiteNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const cta = signedIn
    ? { to: "/dashboard", label: "Open dashboard" }
    : { to: "/login", label: "Log in" };

  // The drawer is rendered as a sibling of the header, not a child: the header
  // uses backdrop-blur, which would otherwise trap the fixed drawer inside it.
  return (
    <>
      <motion.header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className={BRAND}>
            <img src="/runwaydesk-growth-mark.png" alt="RunwayDesk" className="h-12 w-auto object-contain" />
          </Link>

          <ul className="hidden items-center gap-2 md:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <motion.a
                  href={link.href}
                  className={TEXT_LINK}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {link.label}
                </motion.a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <MotionLink
              to={cta.to}
              className={`${SECONDARY} hidden md:inline-flex`}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
            >
              {cta.label}
            </MotionLink>
            <motion.button
              type="button"
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((o) => !o)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className={`${SECONDARY} md:hidden`}
            >
              {open ? <X size={20} aria-hidden /> : <List size={20} aria-hidden />}
            </motion.button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            id="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex flex-col gap-2 bg-white/95 px-4 pb-8 pt-24 backdrop-blur-md md:hidden"
          >
            <motion.button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className={`${SECONDARY} absolute right-4 top-4`}
            >
              <X size={20} aria-hidden />
            </motion.button>

            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                whileTap={{ scale: 0.98 }}
                className={`rounded-md px-2 py-2 text-lg text-neutral-900 ${FOCUS}`}
              >
                {link.label}
              </motion.a>
            ))}
            <MotionLink
              to={cta.to}
              onClick={() => setOpen(false)}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: NAV_LINKS.length * 0.06,
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className={`${PRIMARY} mt-4 self-start`}
            >
              {cta.label}
            </MotionLink>
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
          <article className="flex h-full flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-neutral-900">Today</h3>
            <p className="text-sm text-neutral-600">
              Backward looking spreadsheets and WhatsApp threads
            </p>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
              <div className="flex flex-col gap-2">
                {["Sheet v3 FINAL (2)", "WhatsApp: did they pay?", "Invoice_old.xlsx", "Final FINAL use this one"].map(
                  (label, i) => (
                    <motion.span
                      key={label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
                      className="w-fit rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700"
                    >
                      {label}
                    </motion.span>
                  ),
                )}
              </div>
            </div>
            <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              <WarningCircle size={14} aria-hidden />
              3 overdue invoices
            </span>
          </article>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="h-full"
        >
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
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
              <ul className="flex flex-col gap-2.5">
                {[
                  { label: "Day 19 covered", color: "#059669" },
                  { label: "INV 104 due in 3 days", color: "#d97706" },
                  { label: "Client 15d late", color: "#e11d48" },
                ].map((row, i) => (
                  <motion.li
                    key={row.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 + i * 0.1 }}
                    className="flex items-center gap-2.5 text-xs text-neutral-700"
                  >
                    <motion.span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                      animate={{ scale: [1, 1.25, 1] }}
                      transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1], repeat: Infinity }}
                    />
                    <span className="font-mono tabular-nums">{row.label}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
            <span className="mt-auto inline-flex w-fit items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
              <Clock size={14} aria-hidden />
              Day 19 shortfall flagged
            </span>
          </article>
        </motion.div>
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

function WordReveal({
  word,
  start,
  end,
  progress,
}: {
  word: string;
  start: number;
  end: number;
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(progress, [start, end], [0.25, 1]);
  return (
    <>
      <motion.span style={{ opacity }} className="inline-block">
        {word}
      </motion.span>{" "}
    </>
  );
}

function TaglineSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.85", "end 0.45"],
  });
  const total = TAGLINE_WORDS.length;

  return (
    <section ref={sectionRef} aria-labelledby="tagline-heading" className="px-4 py-24">
      <h2
        id="tagline-heading"
        style={{ textWrap: "balance" } as CSSProperties}
        className="mx-auto max-w-[680px] text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl"
      >
        {TAGLINE_WORDS.map((word, i) => (
          <WordReveal
            key={`${word}-${i}`}
            word={word}
            start={i / total}
            end={(i + 1) / total}
            progress={scrollYProgress}
          />
        ))}
      </h2>
    </section>
  );
}


/* ------------------------------------------------------------------ */
/* Benefits and micro graphics                                          */
/* ------------------------------------------------------------------ */

const BENEFIT_FRAME = "rounded-xl border border-neutral-200 bg-neutral-50/60 p-4";

function CurveGraphic() {
  return (
    <div className={BENEFIT_FRAME}>
      <div className="relative">
        <svg aria-hidden="true" viewBox="0 0 240 100" className="w-full h-auto block">
          <line x1="0" x2="240" y1="40" y2="40" stroke="#d97706" strokeWidth={1.5} strokeDasharray="4 4" />
          <motion.path
            d="M0 20 C40 22 80 30 110 36 C130 40 140 58 150 64 C170 72 200 76 240 78"
            fill="none"
            stroke="#e11d48"
            strokeWidth={2.5}
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.9, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-2 top-2 rounded-md border border-rose-600 bg-white px-2 py-0.5 text-xs font-medium text-rose-600 tabular-nums"
        >
          Day 19
        </motion.div>
      </div>
    </div>
  );
}

const REMINDER_TONES = [
  {
    name: "Friendly",
    text: "Hi, just a gentle reminder about invoice 104. Happy to help if anything is unclear.",
  },
  {
    name: "Firm",
    text: "Invoice 104 is now overdue. Please arrange payment this week.",
  },
  {
    name: "Final",
    text: "This is the final reminder for invoice 104. Please pay or contact me today.",
  },
];

function ToneGraphic() {
  const [tone, setTone] = useState(0);
  const active = REMINDER_TONES[tone];
  return (
    <div className={`${BENEFIT_FRAME} flex flex-col gap-3`}>
      <div role="group" aria-label="Reminder tone" className="flex flex-wrap gap-2">
        {REMINDER_TONES.map((t, i) => (
          <motion.button
            key={t.name}
            type="button"
            aria-pressed={i === tone}
            onClick={() => setTone(i)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className={`relative rounded-full border px-3 py-1 text-xs font-medium ${
              i === tone ? "border-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-900"
            }`}
          >
            {i === tone && (
              <motion.span
                layoutId="tonePill"
                className="absolute inset-0 rounded-full bg-neutral-900"
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <span className="relative">{t.name}</span>
          </motion.button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={active.name}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-900"
        >
          {active.text}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

const QUICK_ADD_CHIPS = [
  { label: "Bill", start: 0.22, mono: false },
  { label: "Figma", start: 0.34, mono: false },
  { label: "₹3,500", start: 0.46, mono: true },
  { label: "Due in 5 days", start: 0.58, mono: true },
];

function QuickAddGraphic() {
  return (
    <div className={`${BENEFIT_FRAME} flex flex-col gap-3`}>
      <div aria-hidden="true" className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
        <motion.span
          className="block"
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 5,
            times: [0, 0.04, 0.86, 0.94],
            repeat: Infinity,
            repeatDelay: 1.2,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          Bill Figma 3500 due in 5 days
        </motion.span>
      </div>
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        {QUICK_ADD_CHIPS.map((chip) => (
          <motion.span
            key={chip.label}
            className={`inline-flex rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-900 ${
              chip.mono ? "font-mono tabular-nums" : ""
            }`}
            animate={{ opacity: [0, 0, 1, 1, 0], y: [4, 4, 0, 0, 0] }}
            transition={{
              duration: 5,
              times: [0, chip.start, chip.start + 0.06, 0.88, 1],
              repeat: Infinity,
              repeatDelay: 1.2,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {chip.label}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

const PRIORITY_ROWS = [
  { label: "INV 104", dot: "bg-rose-600", amount: "₹55,000", status: "Overdue", hot: true },
  { label: "INV 117", dot: "bg-amber-500", status: "Due in 3 days", hot: false },
  { label: "Rent", dot: "bg-emerald-500", status: "Scheduled", hot: false },
];

function PriorityGraphic() {
  return (
    <div className={`${BENEFIT_FRAME} flex flex-col gap-2`}>
      {PRIORITY_ROWS.map((row, i) => (
        <motion.div
          key={row.label}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
          className={`flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm ${
            row.hot ? "border-rose-200" : "border-neutral-200"
          }`}
        >
          <span className="flex items-center gap-2 font-medium text-neutral-900">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${row.dot}`} />
            {row.label}
          </span>
          <span className="flex items-center gap-3">
            {row.amount && <span className="font-mono tabular-nums text-neutral-900">{row.amount}</span>}
            <span className={row.hot ? "font-medium text-rose-600" : "text-neutral-600"}>{row.status}</span>
          </span>
        </motion.div>
      ))}
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
      <div className="relative mt-12">
        <svg
          viewBox="0 0 1000 8"
          preserveAspectRatio="none"
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-2 w-full -translate-y-1/2 md:block"
        >
          <motion.path
            d="M0 4 L1000 4"
            stroke="#d4d4d4"
            strokeWidth={2}
            fill="none"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <ol className="relative grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.li
              key={step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 }}
              className="flex h-full flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 font-mono text-sm tabular-nums text-neutral-900">
                {i + 1}
              </span>
              <h3 className="text-xl font-semibold text-neutral-900">{step}</h3>
            </motion.li>
          ))}
        </ol>
      </div>
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
        {PROOF.map(({ icon: Icon, text }, i) => (
          <motion.li
            key={text}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
            className="flex h-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-6 text-sm font-medium text-neutral-900"
          >
            <Icon size={20} aria-hidden />
            {text}
          </motion.li>
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

const MotionCaret = motion(CaretDown);

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
          <MotionCaret
            size={16}
            aria-hidden
            className="shrink-0"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        </button>
      </h3>
      <div id={panelId} role="region" aria-labelledby={buttonId}>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <p className="px-6 pb-4 text-sm text-neutral-600">{answer}</p>
            </motion.div>
          )}
        </AnimatePresence>
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
    <MotionConfig reducedMotion="user">
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
              <MotionLink
                to="/login"
                className={PRIMARY}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                transition={{ ease: [0.22, 1, 0.36, 1] }}
              >
                Launch studio sandbox
                <ArrowRight size={16} aria-hidden />
              </MotionLink>
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
    </MotionConfig>
  );
}
