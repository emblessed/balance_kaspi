// переписать все функции скана структуры выписки под каспи, найти где сканится тип карты
// парсинг начинать со 2 страницы, на 1 бурмалда

// 1. Определение банка
function identifyBank(docItems) {
    let bank = "не определен";
    const bankSearch = docItems.find(item => item.str.toLowerCase().includes('www.'));

    if (bankSearch) {
        const urlText = bankSearch.str.toLowerCase();
        const match = urlText.match(/www\.([a-z0-9-]+)\./);

        if (match && match[1]) {
            const domainName = match[1];
            switch (domainName) {   
                case 'kaspi' : bank = 'Каспи Банк'; break;
                default: bank = domainName.charAt(0).toUpperCase() + domainName.slice(1);
            }
        }
    }
    return { bank };
}

// 2. Поиск даты
function findDateByOccurrence(items, target) {
    // Паттерн изменен на ДД.ММ.ГГ (2 цифры года вместо 4)
    const datePattern = /\d{2}\.\d{2}\.\d{2}/;
    let count = 0;

    for (let i = 0; i < items.length; i++) {
        const val = items[i].str ? items[i].str.trim() : "";
        if (datePattern.test(val)) {
            count++;
            // Если дублирования даты в разметке Kaspi нет, убираем умножение на 2
            if (count === target) return { item: items[i], index: i };
        }
    }
    return null;
}

// 3. Форматирование денег
function formatMoney(val) {
    if (!val) return null;
    return val.replace(/\s/g, '').replace(',', '.').replace('+', '').trim();
}

// 4. Парсинг даты для JS/MongoDB
function parseDate(dateStr) {
    const [day, month, shortYear] = dateStr.split('.');
    // Превращаем '26' в '2026'
    const fullYear = `20${shortYear}`;
    return new Date(Date.UTC(fullYear, month - 1, day));
}


// 5. Поиск суммы транзакции для Kaspi
function findMoney(items, target) {
    // Регулярка учитывает знак минус/плюс, возможные пробелы внутри числа, копейки и букву 'T' или '₸' на конце
    const moneyPattern = /^[+-]?\s*\d{1,3}(?:\s\d{3})*,\d{2}\s*[T₸]?$/;
    let count = 0;

    for (let i = 0; i < items.length; i++) {
        const val = items[i].str ? items[i].str.trim() : "";
        if (moneyPattern.test(val)) {
            count++;
            if (count === target) {
                return {
                    amount: formatMoney(val),
                    balance: null // У Kaspi нет баланса в строке транзакции
                };
            }
        }
    }
    return null;
}

// 6. Поиск типа операции (категории) для Kaspi
function findCategory(items, target) {
    // Возможные типы операций в выписках Kaspi
    const kaspiOperations = ['Покупка', 'Пополнение', 'Перевод', 'Разное', 'Снятие'];
    let count = 0;

    for (let i = 0; i < items.length; i++) {
        const val = items[i].str ? items[i].str.trim() : "";
        
        // Проверяем, совпадает ли текст с одним из типов операций Kaspi
        if (kaspiOperations.includes(val)) {
            count++;
            if (count === target) {
                return val;
            }
        }
    }
    return "Категория не определена";
}

// 7. Поиск комментария (деталей операции) для Kaspi
function findCommentary(items, target) {
    // Возможные типы операций в Kaspi, после которых идут детали
    const kaspiOperations = ['Покупка', 'Пополнение', 'Перевод', 'Разное', 'Снятие'];
    let count = 0;

    for (let i = 0; i < items.length; i++) {
        const val = items[i].str ? items[i].str.trim() : "";
        
        if (kaspiOperations.includes(val)) {
            count++;
            if (count === target) {
                // В структуре Kaspi детали (контрагент/описание) обычно идут сразу следующим непустым элементом после типа операции
                for (let j = i + 1; j < items.length; j++) {
                    const detailVal = items[j].str ? items[j].str.trim() : "";
                    // Пропускаем пустые строки или случайные знаки валюты/сумм, ищем осмысленный текст деталей
                    if (detailVal.length > 0 && !detailVal.match(/^[T₸]$/) && !detailVal.match(/^[+-]?\d/)) {
                        return detailVal;
                    }
                }
            }
        }
    }
    return null;
}



// 8. Трансформация категорий под Kaspi
function categoryTransform(bankCategory) {
    const categories = {
        'transfers': ['перевод'],
        'products': ['покупка'],
        'withdrawal': ['снятие'],
        'others': ['разное'],
        'transfer': ['перевод']
    };
    
    const rawLower = bankCategory.toLowerCase();

    let cleanCategory = Object.keys(categories).find(key => 
        categories[key].some(word => rawLower.includes(word.toLowerCase()))
    );

    if (!cleanCategory) {
        cleanCategory = 'others';
    }

    return cleanCategory;
}



// Экспортируем все функции
module.exports = {
    identifyBank,
    findDateByOccurrence,
    formatMoney,
    parseDate,
    findMoney,
    findCategory,
    findCommentary,
    categoryTransform
};