const LocalNotifications =
  typeof Capacitor !== 'undefined' &&
  Capacitor.Plugins &&
  Capacitor.Plugins.LocalNotifications
    ? Capacitor.Plugins.LocalNotifications
    : null;

const KEY = 'oshi-money-v1';

let editingEntryId = null;
let currentOshiIndex = 0;

llet state = JSON.parse(localStorage.getItem(KEY) || 'null') || {
  budget: 20000,
  oshis: [],
  oshiColors: {},
  oshiIcons: {},
  entries: [],
  recurring: []
};

// 以前のデータとの互換性
if (!state.oshiColors) {
  state.oshiColors = {};
}

if (!state.recurring) {
  state.recurring = [];
}

state.oshis.forEach(name => {
  if (!state.oshiColors[name]) {
    state.oshiColors[name] = '#eeeeee';
  }
});

let viewDate = new Date();
let selectedDate = null;

const $ = id => document.getElementById(id);

const yen = n =>
  '¥' + Number(n || 0).toLocaleString('ja-JP');

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

function monthKey(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0');
}

/* =========================
   通知
========================= */

function getNotificationId(entry) {

  return Math.floor(
    Number(entry.id) % 2000000000
  );
}


async function cancelEntryNotification(entry) {

  if (!entry) {
    return;
  }

  const notificationId =
    getNotificationId(entry);

  try {

    await LocalNotifications.cancel({
      notifications: [
        {
          id: notificationId
        }
      ]
    });

    console.log('古い通知をキャンセルしました');

  } catch (error) {

    console.error(
      '通知のキャンセルに失敗しました',
      error
    );
  }
}

async function scheduleEntryNotification(entry) {

if (!LocalNotifications) {
  return;
}

if (!entry.notifyEnabled) {
  return;
}

  // 「予定」だけ通知する
  if (entry.type !== 'planned') {
    return;
  }

  // 日付がない場合は何もしない
  if (!entry.date) {
    return;
  }

  // 予定日の朝9:00
  const notifyDate =
  new Date(entry.date + 'T' + (entry.notifyTime || '09:00') + ':00');

  // すでに過ぎている予定には通知しない
  if (notifyDate <= new Date()) {
    return;
  }

  const notificationId =
    Math.floor(
      Number(entry.id) % 2000000000
    );

  try {

    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId,

          title: '推し活マネー',

          body:
            `${entry.memo || entry.category}：${yen(entry.amount)}の支出予定があります`,

          schedule: {
            at: notifyDate
          },

          extra: {
            entryId: entry.id
          }
        }
      ]
    });

    console.log('予定日の9:00に通知を予約しました');

  } catch (error) {

    console.error(
      '通知の予約に失敗しました',
      error
    );
  }
}

/* =========================
   定期支出
========================= */

function makeDate(y, m, day) {
  const lastDay =
    new Date(y, m + 1, 0).getDate();

  const actualDay =
    Math.min(day, lastDay);

  return `${y}-${String(m + 1).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
}

function getRecurringDates(rule) {

  const start = new Date(rule.startDate + 'T00:00:00');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDate =
    start > today ? start : today;

  const dates = [];

  // 今後1年間
  const end = new Date(today);
  end.setFullYear(end.getFullYear() + 1);

  if (rule.frequency === 'monthly') {

    let current =
      new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

    while (current <= end) {

      const date =
        makeDate(
          current.getFullYear(),
          current.getMonth(),
          start.getDate()
        );

      if (date >= rule.startDate) {
        dates.push(date);
      }

      current.setMonth(current.getMonth() + 1);
    }

  } else {

    let year =
      firstDate.getFullYear();

    while (year <= end.getFullYear()) {

      const date =
        makeDate(
          year,
          start.getMonth(),
          start.getDate()
        );

      if (
        date >= rule.startDate &&
        date <= formatDate(end)
      ) {
        dates.push(date);
      }

      year++;
    }
  }

  return dates;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function applyRecurringExpenses() {

  let changed = false;

  state.recurring.forEach(rule => {

    const dates =
      getRecurringDates(rule);

    dates.forEach(date => {

      const exists =
        state.entries.some(e =>
          e.recurringId === rule.id &&
          e.date === date
        );

      if (!exists) {

        const newEntry = {
  id: Date.now() + Math.random(),
  date: date,
  type: 'planned',
  amount: rule.amount,
  oshi: rule.oshi,
  category: rule.category,
  memo: rule.name,
  note: rule.note || '',
  recurringId: rule.id,
  notifyTime: rule.notifyTime || '09:00',
  notifyEnabled: rule.notifyEnabled || false
};

state.entries.push(newEntry);

scheduleEntryNotification(newEntry);

changed = true;
      }
    });
  });

  if (changed) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
}

function renderRecurringOshiSelect() {

  $('recurringOshiSelect').innerHTML =
    state.oshis.map(name =>
      `<option value="${escapeHtml(name)}">
        ${escapeHtml(name)}
      </option>`
    ).join('');
}

function renderRecurringList() {

  if (!state.recurring.length) {

    $('recurringList').innerHTML =
      '<div class="empty">登録されている定期支出はありません</div>';

    return;
  }

  $('recurringList').innerHTML =
    state.recurring.map(rule => {

      const frequency =
        rule.frequency === 'monthly'
          ? '毎月'
          : '毎年';

      return `
        <div class="item">
          <div>
            <b>${escapeHtml(rule.name)}</b>
            <div class="muted">
              ${frequency}・${escapeHtml(rule.startDate)}
            </div>
            <div class="muted">
              ${escapeHtml(rule.oshi)}・${escapeHtml(rule.category)}
            </div>
          </div>

          <div class="amount">
            ${yen(rule.amount)}
          </div>

          ${
            rule.note
              ? `<div class="note">備考：${escapeHtml(rule.note)}</div>`
              : ''
          }

          <button
            data-id="${rule.id}"
            class="delRecurring"
          >
            この定期支出を削除
          </button>
        </div>
      `;
    }).join('');

  document
    .querySelectorAll('.delRecurring')
    .forEach(button => {

      button.onclick = () => {

        const id = Number(button.dataset.id);

        if (
          !confirm(
            'この定期支出を削除しますか？\nすでに作成された予定は残ります。'
          )
        ) {
          return;
        }

        state.recurring =
          state.recurring.filter(
            r => r.id !== id
          );

        save();
      };
    });
}


/* =========================
   全体表示
========================= */

function render() {

  // 定期支出から予定を自動生成
  applyRecurringExpenses();

  renderSummary();
  renderLists();
  renderOshiSelect();
  renderRecurringOshiSelect();
  renderRecurringList();
  renderOshiList();
  renderCalendar();

  // 推しカードを更新
  renderOshiHero();
}


/* =========================
   サマリー
========================= */

function renderSummary() {

  const k = monthKey(new Date());

  const es = state.entries.filter(e =>
    e.date.startsWith(k)
  );

  const actual = es
    .filter(e => e.type === 'actual')
    .reduce((s, e) => s + e.amount, 0);

  const planned = es
    .filter(e => e.type === 'planned')
    .reduce((s, e) => s + e.amount, 0);

  $('actualTotal').textContent = yen(actual);
  $('plannedTotal').textContent = yen(planned);
  $('budgetTotal').textContent = yen(state.budget);

  $('remainingTotal').textContent =
    yen(state.budget - actual - planned);

  $('budgetInput').value =
    state.budget;
}


/* =========================
   支出表示
========================= */

function item(e) {

  const color =
    state.oshiColors?.[e.oshi] || '#eeeeee';

  const paidButton =
    e.type === 'planned'
      ? `<button data-id="${e.id}" class="paid">支出済みにする</button>`
      : '';

  const note = e.note
    ? `<div class="note">備考：${escapeHtml(e.note)}</div>`
    : '';

  const notifyText =
    e.notifyEnabled
      ? `🔔 ${e.notifyTime || '09:00'}`
      : '🔕 通知なし';

  return `
    <div class="item" style="background:${color}">
      <div>
        <b>${escapeHtml(e.memo || e.category)}</b>
        <span class="muted">
          ${escapeHtml(e.oshi)}・${escapeHtml(e.category)}
        </span>
      </div>

      <div class="amount">
        ${yen(e.amount)}
        <span class="muted">${e.date}</span>
      </div>

      <div class="muted">
        ${notifyText}
      </div>

      ${note}

      ${paidButton}

      <button data-id="${e.id}" class="edit">
        編集
      </button>

      <button data-id="${e.id}" class="del">
        削除
      </button>
    </div>
  `;
}

function renderLists() {

  const planned = state.entries
    .filter(e => e.type === 'planned')
    .sort((a, b) =>
      a.date.localeCompare(b.date)
    );

  const actual = state.entries
    .filter(e => e.type === 'actual')
    .sort((a, b) =>
      b.date.localeCompare(a.date)
    );

  $('plannedList').innerHTML =
    planned.length
      ? planned.slice(0, 10).map(item).join('')
      : '<div class="empty">予定はありません</div>';

  $('actualList').innerHTML =
    actual.length
      ? actual.slice(0, 10).map(item).join('')
      : '<div class="empty">実績はありません</div>';

  document
    .querySelectorAll('.paid')
    .forEach(button => {

      button.onclick = () => {

        const e =
          state.entries.find(
            x => x.id == button.dataset.id
          );

        if (e) {
          e.type = 'actual';
          save();
        }
      };
    });

  document
    .querySelectorAll('.del')
    .forEach(button => {

      button.onclick = () => {

        state.entries =
          state.entries.filter(
            x => x.id != button.dataset.id
          );

        save();
      };
    });
document
  .querySelectorAll('.edit')
  .forEach(button => {

    button.onclick = () => {

      const e =
        state.entries.find(
          x => x.id == button.dataset.id
        );

      if (!e) {
        return;
      }

      editingEntryId = e.id;

      $('date').value = e.date;
      $('amount').value = e.amount;
      $('entryType').value = e.type;
      $('oshiSelect').value = e.oshi;
      $('category').value = e.category;
      $('memo').value = e.memo || '';
      $('note').value = e.note || '';

      $('notifyEnabled').value =
        e.notifyEnabled ? 'yes' : 'no';

      $('notifyTime').value =
        e.notifyTime || '09:00';

      updateNotifyTimeVisibility();

      $('addEntry').textContent = '変更を保存';

      $('entryFormTitle').textContent = '支出を編集';

      document
        .querySelector('[data-tab="add"]')
        .click();
    };
  });
}


/* =========================
   推し
========================= */

function renderOshiSelect() {

  $('oshiSelect').innerHTML =
    state.oshis.map(name =>
      `<option value="${escapeHtml(name)}">
        ${escapeHtml(name)}
      </option>`
    ).join('');
}

function renderOshiList() {

  $('oshiList').innerHTML =
    state.oshis.map((name, index) => {

      const color =
        state.oshiColors[name] || '#eeeeee';

      return `
        <div
          class="oshiRow"
          style="background:${color}"
        >
          <span>${escapeHtml(name)}</span>

          <input
            type="color"
            value="${color}"
            data-i="${index}"
            class="oshiColor"
          >

          ${
            index
              ? `<button
                   data-i="${index}"
                   class="delOshi"
                 >削除</button>`
              : ''
          }
        </div>
      `;
    }).join('');

  document
    .querySelectorAll('.oshiColor')
    .forEach(input => {

      input.onchange = () => {

        const name =
          state.oshis[
            Number(input.dataset.i)
          ];

        state.oshiColors[name] =
          input.value;

        save();
      };
    });

  document
    .querySelectorAll('.delOshi')
    .forEach(button => {

      button.onclick = () => {

        const index =
          Number(button.dataset.i);

        const name =
          state.oshis[index];

        if (
          state.entries.some(
            e => e.oshi === name
          )
        ) {
          alert(
            'この推しに紐づく支出があるため削除できません。'
          );
          return;
        }

        state.oshis.splice(index, 1);
        delete state.oshiColors[name];

        save();
      };
    });
}


/* =========================
   HTML安全化
========================= */

function escapeHtml(s) {

  return String(s).replace(
    /[&<>'"]/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[c])
  );
}


/* =========================
   カレンダー
========================= */

function renderCalendar() {

  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();

  $('monthTitle').textContent =
    `${y}年${m + 1}月`;

  const first =
    new Date(y, m, 1).getDay();

  const last =
    new Date(y, m + 1, 0).getDate();

  let html =
    ['日', '月', '火', '水', '木', '金', '土']
      .map(day =>
        `<div class="day head">${day}</div>`
      )
      .join('');

  for (let i = 0; i < first; i++) {
    html += '<div></div>';
  }

  for (let day = 1; day <= last; day++) {

    const date =
      `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const entries =
      state.entries.filter(
        e => e.date === date
      );

    const total =
      entries.reduce(
        (sum, e) => sum + e.amount,
        0
      );

    const colors =
      [...new Set(
        entries
          .map(e =>
            state.oshiColors[e.oshi]
          )
          .filter(Boolean)
      )];

    let background = '';

    if (colors.length === 1) {
      background =
        `style="background:${colors[0]}"`;
    }

    const selected =
      date === selectedDate
        ? ' selected'
        : '';

    html += `
      <div
        class="day${total ? ' has' : ''}${selected}"
        data-date="${date}"
        ${background}
      >
        <b>${day}</b>
        ${total ? yen(total) : ''}
      </div>
    `;
  }

  $('calendarGrid').innerHTML = html;

  document
    .querySelectorAll('.day[data-date]')
    .forEach(day => {

      day.onclick = () => {

        selectedDate =
          day.dataset.date;

        renderCalendar();
      };
    });

  if (selectedDate) {

    const selectedEntries =
      state.entries.filter(
        e => e.date === selectedDate
      );

    $('selectedDate').innerHTML =
      `<h3>${selectedDate}</h3>` +
      (
        selectedEntries.length
          ? selectedEntries.map(item).join('')
          : '<div class="empty">支出はありません</div>'
      );

  } else {

    $('selectedDate').innerHTML =
      '<div class="empty">日付を選択してください</div>';
  }

  document
    .querySelectorAll('#selectedDate .paid')
    .forEach(button => {

      button.onclick = () => {

        const e =
          state.entries.find(
            x => x.id == button.dataset.id
          );

        if (e) {
          e.type = 'actual';
          save();
        }
      };
    });

  document
    .querySelectorAll('#selectedDate .del')
    .forEach(button => {

      button.onclick = () => {

        state.entries =
          state.entries.filter(
            x => x.id != button.dataset.id
          );

        save();
      };
    });
}


/* =========================
   通常の支出追加
========================= */

$('addEntry').onclick = async () => {

  const amount =
    Number($('amount').value);

  const date =
    $('date').value;

  if (!date || !amount || amount < 0) {
    alert('日付と金額を入力してください');
    return;
  }

  // 編集中なら、既存データを変更
  if (editingEntryId !== null) {

    const e =
      state.entries.find(
        x => x.id == editingEntryId
      );

    if (e) {

    await cancelEntryNotification(e);


      e.date =
        $('date').value;

      e.notifyTime =
        $('notifyTime').value;

      e.notifyEnabled =
        $('notifyEnabled').value === 'yes';

      e.type =
        $('entryType').value;

      e.amount =
        amount;

      e.oshi =
        $('oshiSelect').value;

      e.category =
        $('category').value;

      e.memo =
        $('memo').value.trim();

      e.note =
        $('note').value.trim();

      await scheduleEntryNotification(e);

      alert('変更を保存しました！');

editingEntryId = null;

// 入力欄を初期状態に戻す
$('date').value = '';
$('amount').value = '';
$('entryType').value = 'planned';
$('memo').value = '';
$('note').value = '';

$('notifyEnabled').value = 'no';
$('notifyTime').value = '09:00';

updateNotifyTimeVisibility();

$('addEntry').textContent = '追加する';

$('entryFormTitle').textContent = '支出を追加';

save();

document
  .querySelector('[data-tab="home"]')
  .click();

return;
    }
  }

  // 通常の新規追加
  const newEntry = {

    id: Date.now(),

    date: date,

    notifyTime:
      $('notifyTime').value,

    notifyEnabled:
      $('notifyEnabled').value === 'yes',

    type:
      $('entryType').value,

    amount:
      amount,

    oshi:
      $('oshiSelect').value,

    category:
      $('category').value,

    memo:
      $('memo').value.trim(),

    note:
      $('note').value.trim()
  };

  state.entries.push(newEntry);

  await scheduleEntryNotification(newEntry);

  $('amount').value = '';
  $('memo').value = '';
  $('note').value = '';

  save();

  document
    .querySelector('[data-tab="home"]')
    .click();
};

/* =========================
   定期支出追加
========================= */

$('addRecurring').onclick = () => {

  const name =
    $('recurringName').value.trim();

  const amount =
    Number($('recurringAmount').value);

  const startDate =
    $('recurringStartDate').value;

  if (!name || !amount || amount < 0 || !startDate) {

    alert(
      '名前・金額・開始日を入力してください'
    );

    return;
  }

  const rule = {

    id: Date.now(),

    name: name,

    amount: amount,

    oshi:
      $('recurringOshiSelect').value,

    category:
      $('recurringCategory').value,

    frequency:
      $('recurringFrequency').value,

    startDate:
      startDate,

    notifyTime:
      $('recurringNotifyTime').value,

    notifyEnabled:
      $('recurringNotifyEnabled').value === 'yes',

    note:
      $('recurringNote').value.trim()
  };

  state.recurring.push(rule);

  $('recurringName').value = '';
  $('recurringAmount').value = '';
  $('recurringNote').value = '';

  save();

  alert(
    '定期支出を登録しました！\n今後1年分の予定が自動で作成されます。'
  );
};


/* =========================
   推し追加
========================= */

$('addOshi').onclick = () => {

  const name =
    $('oshiName').value.trim();

  if (!name) return;

  if (!state.oshis.includes(name)) {

    state.oshis.push(name);

    state.oshiColors[name] =
      '#eeeeee';
  }

  $('oshiName').value = '';

  save();
};


/* =========================
   予算
========================= */

$('saveBudget').onclick = () => {

  state.budget =
    Number($('budgetInput').value) || 0;

  save();
};


/* =========================
   全データ削除
========================= */

$('clearData').onclick = () => {

  if (
    confirm(
      '全データを削除しますか？'
    )
  ) {

    state = {

      budget: 20000,

      oshis: ['未設定'],

      oshiColors: {
        '未設定': '#eeeeee'
      },

      entries: [],

      recurring: []
    };

    save();
  }
};


/* =========================
   カレンダー移動
========================= */

$('prevMonth').onclick = () => {

  viewDate.setMonth(
    viewDate.getMonth() - 1
  );

  renderCalendar();
};

$('nextMonth').onclick = () => {

  viewDate.setMonth(
    viewDate.getMonth() + 1
  );

  renderCalendar();
};


/* =========================
   タブ
========================= */

document
  .querySelectorAll('.tabs button')
  .forEach(button => {

    button.onclick = () => {

      document
        .querySelectorAll(
          '.tabs button, .tab'
        )
        .forEach(x =>
          x.classList.remove('active')
        );

      button.classList.add('active');

      $(button.dataset.tab)
        .classList.add('active');
    };
  });


/* =========================
   初期設定
========================= */

$('date').value =
  formatDate(new Date());

$('recurringStartDate').value =
  formatDate(new Date());

async function requestNotificationPermission() {
  const permission =
    await LocalNotifications.requestPermissions();

  if (permission.display !== 'granted') {
    alert('通知を使うには、通知を許可してください。');
  }
}

requestNotificationPermission();

async function testNotification() {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 999999,
        title: '推し活マネー',
        body: '通知テスト成功！🔔',
        schedule: {
          at: new Date(Date.now() + 10000)
        }
      }
    ]
  });
}


function updateNotifyTimeVisibility() {

  const enabled =
    $('notifyEnabled').value === 'yes';

  const label =
    $('notifyTimeLabel');

  if (enabled) {
    label.style.display = 'block';
  } else {
    label.style.display = 'none';
  }
}

$('notifyEnabled').onchange =
  updateNotifyTimeVisibility;

updateNotifyTimeVisibility();

render();

function updateRecurringNotifyTimeVisibility() {

  const enabled =
    $('recurringNotifyEnabled').value === 'yes';

  $('recurringNotifyTimeLabel').style.display =
    enabled ? 'block' : 'none';
}

$('recurringNotifyEnabled').onchange =
  updateRecurringNotifyTimeVisibility;

updateNotifyTimeVisibility();

$('notifyEnabled').onchange =
  updateNotifyTimeVisibility;

updateRecurringNotifyTimeVisibility();
function renderOshiHero() {

  const heroName = $('oshiHeroName');
  const heroPlanned = $('oshiHeroPlanned');
  const heroActual = $('oshiHeroActual');
  const hero = $('oshiHero');

  if (!heroName) {
    return;
  }

  const oshis =
    state.oshis.filter(
      name => name !== '未設定'
    );

  if (oshis.length === 0) {

    heroName.textContent =
      '推しを登録しよう！';

    heroPlanned.textContent =
      '¥0';

    heroActual.textContent =
      '¥0';

    return;
  }

  if (currentOshiIndex >= oshis.length) {
    currentOshiIndex = 0;
  }

  const oshi =
    oshis[currentOshiIndex];

  heroName.textContent =
    '⭐ ' + oshi;

  const color =
    state.oshiColors[oshi] || '#eadcff';

  hero.style.background =
    `linear-gradient(135deg, ${color}, #fff)`;

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(now.getMonth() + 1)
      .padStart(2, '0');

  const currentMonth =
    `${year}-${month}`;

  const planned =
    state.entries
      .filter(e =>
        e.oshi === oshi &&
        e.type === 'planned' &&
        e.date.startsWith(currentMonth)
      )
      .reduce(
        (sum, e) =>
          sum + Number(e.amount),
        0
      );

  const actual =
    state.entries
      .filter(e =>
        e.oshi === oshi &&
        e.type === 'actual' &&
        e.date.startsWith(currentMonth)
      )
      .reduce(
        (sum, e) =>
          sum + Number(e.amount),
        0
      );

  heroPlanned.textContent =
    yen(planned);

  heroActual.textContent =
    yen(actual);
}


function changeOshiHero(direction) {

  const oshis =
    state.oshis.filter(
      name => name !== '未設定'
    );

  if (oshis.length === 0) {
    return;
  }

  currentOshiIndex += direction;

  if (currentOshiIndex < 0) {
    currentOshiIndex = oshis.length - 1;
  }

  if (currentOshiIndex >= oshis.length) {
    currentOshiIndex = 0;
  }

  renderOshiHero();
}

$('prevOshi').onclick = () => {
  changeOshiHero(-1);
};

$('nextOshi').onclick = () => {
  changeOshiHero(1);
};
