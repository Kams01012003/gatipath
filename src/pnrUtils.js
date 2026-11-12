export function normalizePnrInput(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 10);
}

export function isExactTenDigitPnr(value) {
  return /^\d{10}$/.test(String(value ?? "").trim());
}

export function sanitizePnrPayload(body) {
  const data = body?.data && typeof body.data === "object" ? body.data : null;
  if (!data) return null;

  const train = data.train && typeof data.train === "object" ? data.train : {};
  const journey = data.journey && typeof data.journey === "object" ? data.journey : {};
  const charting = data.charting && typeof data.charting === "object" ? data.charting : {};
  const passengers = Array.isArray(data.passengers) ? data.passengers : [];

  function station(value) {
    if (!value || typeof value !== "object") return null;
    const code = typeof value.code === "string" ? value.code.trim() : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    if (!code && !name) return null;
    return { code: code || null, name: name || null };
  }

  return {
    pnrNumber: isExactTenDigitPnr(data.pnrNumber) ? String(data.pnrNumber) : null,
    train: {
      number: train.number != null ? String(train.number) : null,
      name: typeof train.name === "string" ? train.name : null,
      source: station(train.source),
      destination: station(train.destination),
      boardingPoint: station(train.boardingPoint),
      reservationUpto: station(train.reservationUpto),
    },
    journey: {
      date: typeof journey.date === "string" ? journey.date : null,
      class: typeof journey.class === "string" ? journey.class : null,
      quota: typeof journey.quota === "string" ? journey.quota : null,
    },
    charting: {
      isPrepared: Boolean(charting.isPrepared),
      status: typeof charting.status === "string" ? charting.status : null,
      chartUrl:
        typeof charting.chartUrl === "string" && charting.chartUrl.startsWith("https://")
          ? charting.chartUrl
          : null,
    },
    passengers: passengers.map((passenger, index) => {
      const item = passenger && typeof passenger === "object" ? passenger : {};
      return {
        passengerNumber:
          Number.isFinite(Number(item.passengerNumber))
            ? Number(item.passengerNumber)
            : index + 1,
        bookingStatus: typeof item.bookingStatus === "string" ? item.bookingStatus : null,
        currentStatus: typeof item.currentStatus === "string" ? item.currentStatus : null,
        coach: typeof item.coach === "string" && item.coach.trim() ? item.coach : null,
        berthNumber:
          item.berthNumber == null || item.berthNumber === ""
            ? null
            : String(item.berthNumber),
        berthCode: typeof item.berthCode === "string" && item.berthCode.trim()
          ? item.berthCode
          : null,
        isConfirmed: Boolean(item.isConfirmed),
        isRAC: Boolean(item.isRAC),
        isWaitlisted: Boolean(item.isWaitlisted),
        isCancelled: Boolean(item.isCancelled),
      };
    }),
    checkedAt:
      typeof body?.meta?.timestamp === "string" ? body.meta.timestamp : new Date().toISOString(),
  };
}

export const OFFICIAL_PNR_CONFIRMATION_URL =
  "https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html?locale=en3";
