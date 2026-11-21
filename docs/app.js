const stations = new Map([
  [16, '梅田'],
  [15, '中津'],
  [14, '西中島南方'],
  [13, '新大阪'],
  [12, '東三国'],
  [11, '江坂'],
  [10, '緑地公園'],
  [9, '桃山台'],
  [8, '千里中央'],
  [7, '箕面船場阪大前'],
  [6, '箕面萱野'],
]);
const terminals = [15, 13, 11, 6];

const shinOsaka = 13;
const japanOffset = 9 * 60 * 60 * 1000;
const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * minuteMs;
const terminalBySymbol = { '': 6, 中: 15, 新: 13, 江: 11 };
const timetableByDay = Object.fromEntries(
  Object.entries(umedaTimetable).map(([day, hours]) => [
    day,
    hours.flatMap((row, index) => row.split(' ').map(entry => ({
      minute: (index + 5) * 60 + Number(entry.slice(0, 2)),
      terminal: terminalBySymbol[entry.slice(2)],
    }))),
  ]),
);

const departureBoard = document.querySelector('#departure-board');
const nextTrain = document.querySelector('#next-train');
const departureVerdict = document.querySelector('#departure-verdict');
const departureDetail = document.querySelector('#departure-detail');
const nextDirect = document.querySelector('#next-direct');
const directTrain = document.querySelector('#direct-train');
const directWait = document.querySelector('#direct-wait');
const followingTrains = document.querySelector('#following-trains');
const followingList = document.querySelector('#following-list');

function departuresOn(operatingDay) {
  const holidays = japaneseHolidays[operatingDay.getUTCFullYear()];
  if (!holidays) return null;

  const weekday = operatingDay.getUTCDay();
  const monthDay = operatingDay.toISOString().slice(5, 10);
  const key = weekday === 0 || weekday === 6 || holidays.has(monthDay) ? 'holiday' : 'weekday';
  return timetableByDay[key].map(train => ({
    time: operatingDay.getTime() + train.minute * minuteMs,
    terminal: train.terminal,
  }));
}

function upcomingDepartures(now) {
  const japanNow = new Date(now.getTime() + japanOffset);
  const serviceDay = new Date(japanNow);
  serviceDay.setUTCHours(0, 0, 0, 0);
  // 時刻表の24時台は、前日から続く営業日の列車。
  if (japanNow.getUTCHours() < 5) {
    serviceDay.setUTCDate(serviceDay.getUTCDate() - 1);
  }

  const departures = departuresOn(serviceDay);
  if (!departures) return [];

  const currentMinute = Math.floor(japanNow.getTime() / minuteMs) * minuteMs;
  const remaining = departures.filter(train => train.time >= currentMinute);
  const followingDay = new Date(serviceDay.getTime() + dayMs);
  return remaining.concat(departuresOn(followingDay) ?? []);
}

function formatDepartureTime(train, now) {
  const departure = new Date(train.time);
  const japanNow = new Date(now.getTime() + japanOffset);
  const date = departure.toISOString().slice(0, 10) === japanNow.toISOString().slice(0, 10)
    ? ''
    : `${departure.getUTCMonth() + 1}/${departure.getUTCDate()} `;
  const time = departure.toISOString().slice(11, 16);
  return `${date}${time}発`;
}

function describeDeparture(train, now) {
  return `${formatDepartureTime(train, now)} · ${stations.get(train.terminal)}行`;
}

function renderFollowingTrains(trains, now) {
  followingTrains.hidden = trains.length === 0;
  followingList.replaceChildren(...trains.map(train => {
    const reaches = train.terminal <= shinOsaka;
    const row = document.createElement('li');
    row.className = 'following-train';
    row.innerHTML = `
      <span class="following-time">${formatDepartureTime(train, now)}</span>
      <strong>${stations.get(train.terminal)}行</strong>
      <span class="following-status ${reaches ? 'reaches' : 'short'}">${reaches ? '新大阪まで直通' : '中津で終点'}</span>
    `;
    return row;
  }));
}

let renderedMinute;
let displayedDeparture;

function updateDepartureBoard() {
  const now = new Date();
  const currentMinute = Math.floor(now.getTime() / minuteMs);
  if (currentMinute === renderedMinute) return;
  renderedMinute = currentMinute;

  const upcoming = upcomingDepartures(now);
  const next = upcoming[0];
  if (!next) {
    const unavailable = '梅田発の発車予定を表示できません';
    if (nextTrain.textContent === unavailable) return;
    departureBoard.dataset.state = 'unknown';
    nextTrain.textContent = unavailable;
    departureVerdict.textContent = '公式時刻表で確認';
    departureDetail.hidden = true;
    nextDirect.hidden = true;
    displayedDeparture = undefined;
    renderFollowingTrains([], now);
    return;
  }

  const nextLabel = describeDeparture(next, now);
  const reaches = next.terminal <= shinOsaka;
  const directIndex = upcoming.findIndex(train => train.terminal <= shinOsaka);
  const direct = upcoming[directIndex];
  if (!reaches && direct) {
    const minutes = Math.ceil((direct.time - japanOffset - now.getTime()) / minuteMs);
    directWait.textContent = `今から約${minutes}分後 · 中津行の${directIndex}本後`;
  }

  if (displayedDeparture === next.time && nextTrain.textContent === nextLabel) return;
  displayedDeparture = next.time;

  departureBoard.dataset.state = reaches ? 'direct' : 'short';
  nextTrain.textContent = nextLabel;
  departureVerdict.textContent = reaches ? '乗り換えなしで行けます' : '中津止まりです';
  departureDetail.hidden = reaches;
  departureDetail.textContent = '新大阪まで行く列車を待ちましょう。';
  nextDirect.hidden = reaches || !direct;
  if (direct) directTrain.textContent = describeDeparture(direct, now);
  renderFollowingTrains(upcoming.slice(1, 5), now);
}

updateDepartureBoard();
setInterval(updateDepartureBoard, 5000);
document.addEventListener('visibilitychange', updateDepartureBoard);

const destination = document.querySelector('#destination');
const shortcuts = document.querySelectorAll('[data-station]');
const board = document.querySelector('#board');
const resultTitle = document.querySelector('#result-title');
const announcement = document.querySelector('#announcement');
const stationMap = document.querySelector('#station-map');

const mapRows = new Map();
for (const [number, name] of stations) {
  const row = document.createElement('li');
  row.className = 'station';
  row.innerHTML = `
    <span class="station-code">M${String(number).padStart(2, '0')}</span>
    <span class="station-dot" aria-hidden="true"></span>
    <span class="station-name">${name}</span>
  `;
  if (number === 16) {
    row.classList.add('origin');
    row.insertAdjacentHTML('beforeend', '<span class="station-note">出発</span>');
  }
  if (number === 15) {
    row.classList.add('nakatsu');
    row.insertAdjacentHTML('beforeend', '<span class="station-note">中津行の終点</span>');
  }
  mapRows.set(number, row);
  stationMap.append(row);
}

function renderDestination() {
  const selected = Number(destination.value);
  const stationName = stations.get(selected);

  resultTitle.textContent = `${stationName}まで乗り換えなしで行ける列車`;
  board.replaceChildren();
  for (const terminal of terminals) {
    const reaches = terminal <= selected;
    const service = document.createElement('li');
    service.className = reaches ? 'service reaches' : 'service short';
    service.innerHTML = `
      <span class="status-icon" aria-hidden="true">${reaches ? '✓' : '!'}</span>
      <span class="service-name">${stations.get(terminal)}<small>行</small></span>
      <span class="service-status">${reaches ? '直通' : '途中で終点'}</span>
    `;
    board.append(service);
  }

  for (const [number, row] of mapRows) {
    const isSelected = number === selected;
    row.classList.toggle('selected', isSelected);
    if (isSelected) {
      row.setAttribute('aria-current', 'true');
    } else {
      row.removeAttribute('aria-current');
    }
  }

  for (const button of shortcuts) {
    button.setAttribute('aria-pressed', String(button.dataset.station === destination.value));
  }

  const directServices = terminals
    .filter(terminal => terminal <= selected)
    .map(terminal => `${stations.get(terminal)}行`);
  announcement.textContent = `${stationName}まで直通。 ${directServices.join('、')}。`;
}

destination.addEventListener('change', renderDestination);
for (const button of shortcuts) {
  button.addEventListener('click', () => {
    destination.value = button.dataset.station;
    renderDestination();
  });
}

renderDestination();
