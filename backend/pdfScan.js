// Модуль сканирования и парсинга банковских выписок (Kaspi Bank)

// 1. Определение банка
function identifyBank(docItems) {
  let bank = 'не определен';
  const bankSearch = docItems.find((item) =>
    item.str && item.str.toLowerCase().includes('www.')
  );

  if (bankSearch) {
    const urlText = bankSearch.str.toLowerCase();
    const match = urlText.match(/www\.([a-z0-9-]+)\./);

    if (match && match[1]) {
      const domainName = match[1];
      switch (domainName) {
        case 'kaspi':
          bank = 'Каспи Банк';
          break;
        default:
          bank = domainName.charAt(0).toUpperCase() + domainName.slice(1);
      }
    }
  }
  return { bank };
}

// 2. Форматирование строки суммы в число
function parseMoneyToNumber(str) {
  if (!str) return 0;
  const cleanStr = String(str)
    .replace(/\s/g, '')
    .replace('₸', '')
    .replace('T', '')
    .replace('+', '')
    .replace(',', '.');
  return parseFloat(cleanStr) || 0;
}

// 3. Форматирование денег для обратной совместимости
function formatMoney(val) {
  if (!val) return null;
  return String(val)
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace('+', '')
    .trim();
}

// 4. Парсинг даты для JS / MongoDB
function parseDate(dateStr) {
  if (!dateStr) return new Date();
  const [day, month, shortYear] = dateStr.split('.');
  const fullYear = shortYear && shortYear.length === 2 ? `20${shortYear}` : shortYear;
  return new Date(Date.UTC(Number(fullYear), Number(month) - 1, Number(day)));
}

// 5. Интеллектуальная трансформация категорий по операции, деталям (комментарию) и знаку суммы
function categoryTransform(bankCategory, commentary = '', amount = 0) {
  const opLower = String(bankCategory || '').toLowerCase().trim();
  const detLower = String(commentary || '').toLowerCase().trim();

  // 1. Положительные суммы — ДОХОДЫ (никогда не могут быть расходами/покупками/снятием)
  if (amount > 0) {
    if (
      detLower.includes('зарплат') ||
      detLower.includes('аванс') ||
      detLower.includes('оклад')
    ) {
      return 'salary';
    }
    if (detLower.includes('возврат') || opLower.includes('возврат')) {
      return 'refund';
    }
    // Пополнение наличными через банкомат
    if (detLower.includes('банкомат') || detLower.includes('наличн')) {
      return 'cash';
    }
    // Входящие переводы с карты или от физлиц
    if (
      opLower.includes('перевод') ||
      detLower.includes('перевод') ||
      detLower.includes('карты другого банка')
    ) {
      return 'transfers';
    }
    return 'income';
  }

  // 2. Отрицательные суммы — РАСХОДЫ (никогда не могут быть пополнением/доходами/зарплатой)
  if (opLower.includes('сняти') || detLower.includes('снятие')) {
    return 'withdrawal';
  }

  if (
    detLower.includes('комисси') ||
    (opLower.includes('разное') && detLower.includes('комис'))
  ) {
    return 'fees';
  }

  if (opLower.includes('перевод')) {
    return 'transfers';
  }

  // Покупки / Платежи / Разное — определение по деталям (наименованию контрагента)
  if (
    detLower.match(
      /аптек|фарм|медсервис|лекарств|клиник|медицин|стоматолог|здоров/
    )
  ) {
    return 'pharmacy';
  }
  // Транспорт: Такси (Yandex Go, Uber, InDrive), автобусы, проезд (Avtobys, Onay, билеты)
  if (
    detLower.match(
      /yandex\.?go|яндекс.*такси|uber|такси|диди|indrive|автобус|avtobys|onay|онай|транспорт|проезд|билет/
    )
  ) {
    return 'transport';
  }
  if (detLower.match(/азс|helios|sinooil|qazaq oil|газпром|бензин|топливо/)) {
    return 'fuel';
  }
  if (
    detLower.match(
      /автомойк|автосервис|сто |запчаст|шиномонтаж|авто/
    )
  ) {
    return 'automobile';
  }
  if (
    detLower.match(
      /кафе|ресторан|кофейн|coffee|столов|пицц|dodo|додо|sushi|суши|kfc|mcdonald|burger|бургер|бар|паб|доставка.*еды|glovo|wolt|chocofood/
    )
  ) {
    return 'restaurant';
  }
  if (
    detLower.match(
      /zara|bershka|l-shop|одежд|обув|бутик|stradivarius|pull.*bear|mango|hm|h&m|defacto|waikiki/
    )
  ) {
    return 'clothes';
  }
  if (
    detLower.match(
      /magnum|магнит|супермаркет|мини.*маркет|гастроном|маркет|продукты|хлеб|мясо|овощи|фрукты|ваш магазин|смалл|small|spar|дидар|fix price/
    )
  ) {
    return 'products';
  }
  if (
    detLower.match(
      /казахтелеком|beeline|kcell|activ|tele2|altel|связь|интернет/
    )
  ) {
    return 'communication';
  }
  if (detLower.match(/коммунал|энерго|водоканал|тепло|ерц|ивц|куск/)) {
    return 'utilities';
  }
  if (detLower.match(/дом|мебель|строй|leroy|леруа|хозмаг/)) {
    return 'home';
  }
  if (detLower.match(/услуг|сервис|нотариус|печать|фото/)) {
    return 'services';
  }
  if (
    detLower.match(
      /wildberries|ozon|aliexpress|kaspi магазин|шопинг|покупк/
    )
  ) {
    return 'shopping';
  }

  // Если операция «Покупка», но конкретный магазин не попал в список выше (напр. ИП)
  if (opLower.includes('покупк')) {
    return 'products';
  }

  return 'others';
}

// 6. Построчный парсинг строк таблицы выписки Kaspi (исключает сдвиг колонок)
function parseKaspiPageRows(pageItems, pageNum) {
  // На странице 2 пропускаем верхнюю сводку (заголовок таблицы Дата/Сумма/Операция/Детали на y ≈ 334)
  const maxY = pageNum === 2 ? 330 : 800;
  const minY = 40;

  const validItems = pageItems
    .map((it) => ({ str: (it.str || '').trim(), x: it.x, y: it.y }))
    .filter((it) => it.str && it.y >= minY && it.y <= maxY);

  // Группируем элементы по вертикальной координате y (строке)
  const yGroups = [];
  const sorted = validItems.sort((a, b) => b.y - a.y);

  for (const item of sorted) {
    let group = yGroups.find((g) => Math.abs(g.y - item.y) <= 4);
    if (!group) {
      group = { y: item.y, items: [] };
      yGroups.push(group);
    }
    group.items.push(item);
  }

  yGroups.sort((a, b) => b.y - a.y);

  const rows = [];

  for (let r = 0; r < yGroups.length; r += 1) {
    const group = yGroups[r];
    group.items.sort((a, b) => a.x - b.x);

    const dateItem = group.items.find(
      (it) => /^\d{2}\.\d{2}\.\d{2}$/.test(it.str) && it.x < 100
    );
    const moneyItem = group.items.find(
      (it) =>
        /^[+-]?\s*\d[\d\s]*,[\d]{2}\s*[T₸]?$/.test(it.str) &&
        it.x >= 100 &&
        it.x < 210
    );

    if (dateItem && moneyItem) {
      const opItem = group.items.find((it) => it.x >= 210 && it.x < 310);
      const detailItems = group.items.filter((it) => it.x >= 310);

      let op = opItem ? opItem.str : '';
      let details = detailItems.map((it) => it.str).join(' ');

      // Проверяем последующие строки на перенос длинных названий (без даты и суммы)
      let nextIdx = r + 1;
      while (nextIdx < yGroups.length) {
        const nextGroup = yGroups[nextIdx];
        const nextHasDate = nextGroup.items.some(
          (it) => /^\d{2}\.\d{2}\.\d{2}$/.test(it.str) && it.x < 100
        );
        const nextHasMoney = nextGroup.items.some(
          (it) =>
            /^[+-]?\s*\d[\d\s]*,[\d]{2}\s*[T₸]?$/.test(it.str) &&
            it.x >= 100 &&
            it.x < 210
        );
        if (nextHasDate || nextHasMoney) break;

        const wrappedOp = nextGroup.items
          .filter((it) => it.x >= 210 && it.x < 310)
          .map((it) => it.str)
          .join(' ');
        const wrappedDetails = nextGroup.items
          .filter((it) => it.x >= 310)
          .map((it) => it.str)
          .join(' ');

        if (wrappedOp) op = (op + ' ' + wrappedOp).trim();
        if (wrappedDetails) details = (details + ' ' + wrappedDetails).trim();
        nextIdx += 1;
      }

      const cleanAmount = parseMoneyToNumber(moneyItem.str);

      rows.push({
        dateStr: dateItem.str,
        amountStr: moneyItem.str,
        cleanAmount,
        operation: op || (cleanAmount > 0 ? 'Пополнение' : 'Покупка'),
        commentary: details || 'Детали не указаны',
      });
    }
  }

  return rows;
}

// Функции для обратной совместимости со старыми модулями
function findDateByOccurrence(items, target) {
  const datePattern = /\d{2}\.\d{2}\.\d{2}/;
  let count = 0;
  for (let i = 0; i < items.length; i += 1) {
    const val = items[i].str ? items[i].str.trim() : '';
    if (datePattern.test(val)) {
      count += 1;
      if (count === target) return { item: items[i], index: i };
    }
  }
  return null;
}

function findMoney(items, target) {
  const moneyPattern = /^[+-]?\s*\d{1,3}(?:\s\d{3})*,\d{2}\s*[T₸]?$/;
  let count = 0;
  for (let i = 0; i < items.length; i += 1) {
    const val = items[i].str ? items[i].str.trim() : '';
    if (moneyPattern.test(val)) {
      count += 1;
      if (count === target) {
        return {
          amount: formatMoney(val),
          balance: null,
        };
      }
    }
  }
  return null;
}

function findCategory(items, target) {
  const kaspiOperations = ['Покупка', 'Пополнение', 'Перевод', 'Разное', 'Снятие'];
  let count = 0;
  for (let i = 0; i < items.length; i += 1) {
    const val = items[i].str ? items[i].str.trim() : '';
    if (kaspiOperations.some((op) => val.includes(op))) {
      count += 1;
      if (count === target) return val;
    }
  }
  return 'Категория не определена';
}

function findCommentary(items, target) {
  const kaspiOperations = ['Покупка', 'Пополнение', 'Перевод', 'Разное', 'Снятие'];
  let count = 0;
  for (let i = 0; i < items.length; i += 1) {
    const val = items[i].str ? items[i].str.trim() : '';
    if (kaspiOperations.some((op) => val.includes(op))) {
      count += 1;
      if (count === target) {
        for (let j = i + 1; j < items.length; j += 1) {
          const detailVal = items[j].str ? items[j].str.trim() : '';
          if (
            detailVal.length > 0 &&
            !detailVal.match(/^[T₸]$/) &&
            !detailVal.match(/^[+-]?\d/)
          ) {
            return detailVal;
          }
        }
      }
    }
  }
  return null;
}

module.exports = {
  identifyBank,
  parseMoneyToNumber,
  formatMoney,
  parseDate,
  findDateByOccurrence,
  findMoney,
  findCategory,
  findCommentary,
  categoryTransform,
  parseKaspiPageRows,
};
