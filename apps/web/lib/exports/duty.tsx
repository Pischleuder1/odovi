import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { MonthReport, ReportDrive } from "@odovi/core";

import {
  DUTY_RATE_EUR_PER_KM,
  buildDutySummary,
  reimbursementForDistance,
} from "../dutyReport";

export interface DutyExportLabels {
  locale: string;
  title: string;
  subtitle: string;
  driveCount: string;
  distance: string;
  rate: string;
  reimbursement: string;
  date: string;
  time: string;
  route: string;
  customerPurpose: string;
  km: string;
  amount: string;
  incomplete: string;
  generated: string;
}

function formatNumber(value: number, digits: number, locale: string): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateCell(dateStr: string, locale: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatClock(value: Date | null, timeZone: string, locale: string): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(value);
}

function quoteCsv(value: string): string {
  if (!/[;"\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function toCsv(rows: string[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(quoteCsv).join(";")).join("\r\n") + "\r\n";
}

function annotationsByDrive(drives: ReportDrive[]) {
  return new Map(
    drives.map((drive) => [
      drive.id,
      {
        customer: drive.customer?.trim() || null,
        purpose: drive.purpose?.trim() || null,
      },
    ]),
  );
}

function customerPurpose(
  driveId: number,
  annotations: ReturnType<typeof annotationsByDrive>,
): string {
  const item = annotations.get(driveId);
  if (!item) return "";
  if (item.customer && item.purpose) return `${item.customer} – ${item.purpose}`;
  return item.customer ?? item.purpose ?? "";
}

export function renderDutyMonthCsv(
  report: MonthReport,
  drives: ReportDrive[],
  labels: DutyExportLabels,
): string {
  const rows = report.rows.filter((row) => row.classification === "business");
  const summary = buildDutySummary(rows);
  const annotations = annotationsByDrive(drives);

  const out: string[][] = [
    [labels.title],
    [labels.subtitle, report.month],
    [],
    [labels.driveCount, String(summary.driveCount)],
    [labels.distance, formatNumber(summary.distanceKm, 1, labels.locale) + " km"],
    [labels.rate, formatCurrency(DUTY_RATE_EUR_PER_KM, labels.locale) + "/km"],
    [labels.reimbursement, formatCurrency(summary.reimbursementEur, labels.locale)],
    [],
    [
      labels.date,
      labels.time,
      labels.route,
      labels.customerPurpose,
      labels.km,
      labels.amount,
    ],
  ];

  for (const row of rows) {
    const amount = reimbursementForDistance(row.distanceKm);
    out.push([
      formatDateCell(row.date, labels.locale),
      `${formatClock(row.startTime, row.meta.timeZone, labels.locale)} – ${formatClock(
        row.endTime,
        row.meta.timeZone,
        labels.locale,
      )}`,
      `${row.startPlace} -> ${row.endPlace}`,
      customerPurpose(row.id, annotations),
      row.distanceKm != null ? formatNumber(row.distanceKm, 1, labels.locale) : "",
      amount != null ? formatCurrency(amount, labels.locale) : "",
    ]);
  }

  out.push([]);
  out.push([
    labels.reimbursement,
    "",
    "",
    "",
    formatNumber(summary.distanceKm, 1, labels.locale),
    formatCurrency(summary.reimbursementEur, labels.locale),
  ]);

  if (summary.hasIncompleteDistance) {
    out.push([]);
    out.push([labels.incomplete]);
  }

  return toCsv(out);
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingRight: 28,
    paddingBottom: 34,
    paddingLeft: 28,
    fontSize: 8,
    fontFamily: "Helvetica",
  },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#555555", marginBottom: 14 },
  summary: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  summaryBox: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#dddddd",
    borderRadius: 4,
    padding: 7,
  },
  summaryLabel: { fontSize: 7, color: "#666666", marginBottom: 2 },
  summaryValue: { fontSize: 11, fontWeight: 700 },
  table: { borderWidth: 1, borderColor: "#dddddd" },
  row: { display: "flex", flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eeeeee" },
  headerRow: { backgroundColor: "#f3f4f6", fontWeight: 700 },
  cell: { padding: 4 },
  date: { width: "11%" },
  time: { width: "14%" },
  route: { width: "29%" },
  purpose: { width: "22%" },
  km: { width: "10%", textAlign: "right" },
  amount: { width: "14%", textAlign: "right" },
  totalRow: { backgroundColor: "#f8f8f8", fontWeight: 700 },
  note: { marginTop: 8, fontSize: 7, color: "#666666" },
  footer: {
    position: "absolute",
    left: 28,
    right: 28,
    bottom: 16,
    fontSize: 6.5,
    color: "#777777",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function DutyMonthPdf({
  report,
  drives,
  labels,
}: {
  report: MonthReport;
  drives: ReportDrive[];
  labels: DutyExportLabels;
}) {
  const rows = report.rows.filter((row) => row.classification === "business");
  const summary = buildDutySummary(rows);
  const annotations = annotationsByDrive(drives);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{labels.title}</Text>
        <Text style={styles.subtitle}>
          {labels.subtitle}: {report.month} · {report.meta.vehicleName}
        </Text>

        <View style={styles.summary}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>{labels.driveCount}</Text>
            <Text style={styles.summaryValue}>{summary.driveCount}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>{labels.distance}</Text>
            <Text style={styles.summaryValue}>
              {formatNumber(summary.distanceKm, 1, labels.locale)} km
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>{labels.rate}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(DUTY_RATE_EUR_PER_KM, labels.locale)}/km
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>{labels.reimbursement}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(summary.reimbursementEur, labels.locale)}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <Text style={[styles.cell, styles.date]}>{labels.date}</Text>
            <Text style={[styles.cell, styles.time]}>{labels.time}</Text>
            <Text style={[styles.cell, styles.route]}>{labels.route}</Text>
            <Text style={[styles.cell, styles.purpose]}>{labels.customerPurpose}</Text>
            <Text style={[styles.cell, styles.km]}>{labels.km}</Text>
            <Text style={[styles.cell, styles.amount]}>{labels.amount}</Text>
          </View>

          {rows.map((row) => {
            const amount = reimbursementForDistance(row.distanceKm);
            return (
              <View style={styles.row} key={row.id} wrap={false}>
                <Text style={[styles.cell, styles.date]}>
                  {formatDateCell(row.date, labels.locale)}
                </Text>
                <Text style={[styles.cell, styles.time]}>
                  {formatClock(row.startTime, row.meta.timeZone, labels.locale)} –{" "}
                  {formatClock(row.endTime, row.meta.timeZone, labels.locale)}
                </Text>
                <Text style={[styles.cell, styles.route]}>
                  {row.startPlace} -&gt; {row.endPlace}
                </Text>
                <Text style={[styles.cell, styles.purpose]}>
                  {customerPurpose(row.id, annotations) || "–"}
                </Text>
                <Text style={[styles.cell, styles.km]}>
                  {row.distanceKm != null
                    ? formatNumber(row.distanceKm, 1, labels.locale)
                    : "–"}
                </Text>
                <Text style={[styles.cell, styles.amount]}>
                  {amount != null ? formatCurrency(amount, labels.locale) : "–"}
                </Text>
              </View>
            );
          })}

          <View style={[styles.row, styles.totalRow]}>
            <Text style={[styles.cell, { width: "76%" }]}>{labels.reimbursement}</Text>
            <Text style={[styles.cell, styles.km]}>
              {formatNumber(summary.distanceKm, 1, labels.locale)}
            </Text>
            <Text style={[styles.cell, styles.amount]}>
              {formatCurrency(summary.reimbursementEur, labels.locale)}
            </Text>
          </View>
        </View>

        {summary.hasIncompleteDistance && (
          <Text style={styles.note}>{labels.incomplete}</Text>
        )}

        <View style={styles.footer} fixed>
          <Text>
            {labels.rate}: {formatCurrency(DUTY_RATE_EUR_PER_KM, labels.locale)}/km
          </Text>
          <Text>
            {labels.generated}:{" "}
            {new Intl.DateTimeFormat(labels.locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: report.meta.timeZone,
            }).format(report.meta.generatedAt)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderDutyMonthPdf(
  report: MonthReport,
  drives: ReportDrive[],
  labels: DutyExportLabels,
): Promise<Buffer> {
  return renderToBuffer(<DutyMonthPdf report={report} drives={drives} labels={labels} />);
}
