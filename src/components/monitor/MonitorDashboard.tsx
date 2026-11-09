import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { VitalName, VitalRating } from "@/lib/telemetry/events";
import { formatRate, formatVital, formatWhen } from "@/lib/telemetry/monitorFormat";
import { MONITOR_TIME_ZONE, type MonitorView } from "@/lib/telemetry/monitorView";
import { MIN_SAMPLES, type Summary, type VitalCell } from "@/lib/telemetry/summary";
import ErrorsChart from "./ErrorsChart";
import MonitorFilters from "./MonitorFilters";
import "./monitor.css";

/**
 * The monitor (#458): what visitors' browsers and the server reported over a
 * range, from `telemetry_events`. Everything under the filters is the same
 * slice, so the numbers agree with each other.
 */

const RATING_LABEL: Record<VitalRating, string> = { good: "Good", "needs-improvement": "Needs work", poor: "Poor" };
const ROUTE_VITALS: readonly VitalName[] = ["LCP", "INP", "CLS", "FCP", "TTFB"];

function Rating({ rating }: { rating: VitalRating | null }) {
	if (!rating) return null;
	const Icon = rating === "good" ? CheckCircle2 : rating === "poor" ? XCircle : AlertTriangle;
	return (
		<span className="mon-rating" data-rating={rating}>
			<Icon aria-hidden />
			{RATING_LABEL[rating]}
		</span>
	);
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
	return (
		<div className="mon-tile">
			<span className="mon-tile-label">{label}</span>
			<span className="mon-tile-value">{value}</span>
			<span className="mon-tile-sub">{sub}</span>
		</div>
	);
}

function VitalTile({ name, cell }: { name: "LCP" | "INP" | "CLS"; cell: VitalCell }) {
	const few = cell.n > 0 && cell.n < MIN_SAMPLES;
	return (
		<Tile
			label={`${name} · P75`}
			value={formatVital(name, cell.p75)}
			sub={
				cell.n === 0 ? (
					"No samples"
				) : (
					<>
						<Rating rating={cell.rating} /> · {cell.n} sample{cell.n === 1 ? "" : "s"}
						{few ? ", too few to trust" : ""}
					</>
				)
			}
		/>
	);
}

export default function MonitorDashboard({ summary, view, truncated }: { summary: Summary; view: MonitorView; truncated: boolean }) {
	const { loads, browserErrors, errorRate, serverErrors, overall, routes, buckets, recentErrors, automated } = summary;
	const nothing = loads === 0 && browserErrors === 0 && serverErrors === 0 && automated.crawlerRows === 0 && automated.malformedRequests.length === 0;

	return (
		<div className="mon gp-rise">
			<header className="mon-head">
				<h1>Monitor</h1>
				<p>What visitors&apos; browsers and the server reported. Times are China Standard Time.</p>
			</header>
			<MonitorFilters range={view.range} viewport={view.viewport}>
				{truncated && (
					<p className="mon-note" data-tone="warn">
						More reports than one view reads: these are the newest. Pick a shorter range for every one.
					</p>
				)}
				{nothing ? (
					<p className="mon-empty">No reports in this range.</p>
				) : (
					<>
						<section className="mon-tiles" aria-label="Totals">
							<Tile label="Page loads" value={loads.toLocaleString("en")} sub="Counted from first paints" />
							<Tile
								label="Browser errors per load"
								value={formatRate(errorRate)}
								sub={`${browserErrors} error${browserErrors === 1 ? "" : "s"}`}
							/>
							<Tile
								label="Server errors"
								value={serverErrors.toLocaleString("en")}
								sub={view.screen ? "Every screen: the server sees none" : "Render and route failures"}
							/>
							<VitalTile name="LCP" cell={overall.LCP} />
							<VitalTile name="INP" cell={overall.INP} />
							<VitalTile name="CLS" cell={overall.CLS} />
						</section>

						<section className="mon-card" aria-labelledby="mon-errors">
							<h2 id="mon-errors">Errors over time</h2>
							<p className="mon-card-sub">Crawlers and scanners&apos; malformed requests are left out; they are listed below.</p>
							<ErrorsChart buckets={buckets} bucket={view.bucket} />
						</section>

						<section className="mon-card" aria-labelledby="mon-routes">
							<h2 id="mon-routes">Web Vitals by page · P75</h2>
							<p className="mon-card-sub">Greyed: fewer than {MIN_SAMPLES} samples, so the number says little.</p>
							{routes.length === 0 ? (
								<p className="mon-empty">No Web Vitals in this range.</p>
							) : (
								<div className="mon-scroll">
									<table className="mon-table">
										<thead>
											<tr>
												<th>Page</th>
												<th className="mon-num">Loads</th>
												{ROUTE_VITALS.map((name) => (
													<th key={name} className="mon-num">
														{name}
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{routes.map((r) => (
												<tr key={r.route}>
													<td className="mon-route">{r.route}</td>
													<td className="mon-num">{r.loads}</td>
													{ROUTE_VITALS.map((name) => {
														const c = r.metrics[name];
														return (
															<td key={name} className="mon-num">
																{c.n === 0 ? (
																	"—"
																) : (
																	<span className="mon-cell" data-few={c.n < MIN_SAMPLES ? "" : undefined} title={`${c.n} sample${c.n === 1 ? "" : "s"}`}>
																		{formatVital(name, c.p75)}
																		<Rating rating={c.rating} />
																		<span className="mon-n">n = {c.n}</span>
																	</span>
																)}
															</td>
														);
													})}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</section>

						<div className="mon-split">
							<section className="mon-card" aria-labelledby="mon-recent">
								<h2 id="mon-recent">Recent errors</h2>
								{recentErrors.length === 0 ? (
									<p className="mon-empty">No errors in this range.</p>
								) : (
									<div className="mon-scroll">
										<table className="mon-table">
											<thead>
												<tr>
													<th>Last seen</th>
													<th>Source</th>
													<th>Page</th>
													<th>Message</th>
													<th className="mon-num">Times</th>
													<th>Build</th>
												</tr>
											</thead>
											<tbody>
												{recentErrors.map((e) => (
													<tr key={`${e.source}|${e.route}|${e.message}`}>
														<td className="mon-num">{formatWhen(e.lastAt, MONITOR_TIME_ZONE)}</td>
														<td>{e.source}</td>
														<td className="mon-route">{e.route}</td>
														<td className="mon-msg">{e.message}</td>
														<td className="mon-num">{e.count}</td>
														<td className="mon-route">{e.build ? e.build.slice(0, 7) : "—"}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</section>

							<section className="mon-card" aria-labelledby="mon-bots">
								<h2 id="mon-bots">Not visitors</h2>
								<p className="mon-card-sub">Kept out of every number above.</p>
								<p className="mon-note">
									Crawler reports: <b>{automated.crawlerRows}</b>
									{automated.crawlerRows > 0 ? " (from before the filter, #453, or a user agent it misses)" : ""}
								</p>
								{automated.crawlerAgents.length > 0 && (
									<ul className="mon-note">
										{automated.crawlerAgents.map((agent) => (
											<li key={agent} className="mon-msg">
												{agent}
											</li>
										))}
									</ul>
								)}
								{automated.malformedRequests.length === 0 ? (
									<p className="mon-note">No malformed requests.</p>
								) : (
									<div className="mon-scroll">
										<table className="mon-table">
											<thead>
												<tr>
													<th>Last seen</th>
													<th>Page</th>
													<th>Malformed request</th>
													<th className="mon-num">Times</th>
												</tr>
											</thead>
											<tbody>
												{automated.malformedRequests.map((m) => (
													<tr key={`${m.route}|${m.message}`}>
														<td className="mon-num">{formatWhen(m.lastAt, MONITOR_TIME_ZONE)}</td>
														<td className="mon-route">{m.route}</td>
														<td className="mon-msg">{m.message}</td>
														<td className="mon-num">{m.count}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</section>
						</div>
					</>
				)}
			</MonitorFilters>
		</div>
	);
}
