const menuGrid = document.getElementById("menuGrid");
const categoriesList = document.getElementById("categoriesList");

const cartPanel = document.getElementById("cartPanel");
const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotalCount = document.getElementById("cartTotalCount");
const cartTotalPrice = document.getElementById("cartTotalPrice");

const cartGuestCount = document.getElementById("cartGuestCount");
const cartPricePerGuest = document.getElementById("cartPricePerGuest");

const clearCartBtn = document.getElementById("clearCartBtn");
const checkoutBtn = document.getElementById("checkoutBtn");
const mobileCartBtn = document.getElementById("mobileCartBtn");
const cartToggle = document.getElementById("cartToggle");
const cartOverlay = document.getElementById("cartOverlay");
const closeCartBtn = document.getElementById("closeCartBtn");

const productModal = document.getElementById("productModal");
const closeProductModal = document.getElementById("closeProductModal");
const modalImage = document.getElementById("modalImage");
const modalCategory = document.getElementById("modalCategory");
const modalTitle = document.getElementById("modalTitle");
const modalPrice = document.getElementById("modalPrice");
const modalDescription = document.getElementById("modalDescription");
const modalComposition = document.getElementById("modalComposition");
const modalNutrition = document.getElementById("modalNutrition");
const modalAllergens = document.getElementById("modalAllergens");
const modalNoteWrap = document.getElementById("modalNoteWrap");
const modalNote = document.getElementById("modalNote");
const modalAddToCart = document.getElementById("modalAddToCart");

const checkoutForm = document.getElementById("checkoutForm");
const orderSuccess = document.getElementById("orderSuccess");
const orderSuccessText = document.getElementById("orderSuccessText");
const successOrderId = document.getElementById("successOrderId");
const newOrderBtn = document.getElementById("newOrderBtn");
const orderSubmitBtn = document.getElementById("orderSubmitBtn");
const phoneInput = document.getElementById("phone");

let orderSubmitInFlight = false;

function setSubmitOrderLoading(loading) {
  if (!orderSubmitBtn) return;
  if (loading) {
    if (!orderSubmitBtn.dataset.defaultLabel) {
      orderSubmitBtn.dataset.defaultLabel = orderSubmitBtn.textContent.trim();
    }
    orderSubmitBtn.disabled = true;
    orderSubmitBtn.setAttribute("aria-busy", "true");
    orderSubmitBtn.classList.add("is-busy");
    orderSubmitBtn.textContent = "Отправляем…";
  } else {
    orderSubmitBtn.disabled = false;
    orderSubmitBtn.removeAttribute("aria-busy");
    orderSubmitBtn.classList.remove("is-busy");
    orderSubmitBtn.textContent =
      orderSubmitBtn.dataset.defaultLabel || "Отправить заказ";
  }
}

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");
const toastSubtitle = document.getElementById("toastSubtitle");

let toastHideTimer = null;

function showToast(message, timeout = 4000, subtitle = null) {
  if (!toast || !toastMessage) return;
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  toastMessage.textContent = message;
  if (toastSubtitle) {
    if (subtitle) {
      toastSubtitle.textContent = subtitle;
      toastSubtitle.hidden = false;
    } else {
      toastSubtitle.textContent = "";
      toastSubtitle.hidden = true;
    }
  }
  toast.classList.add("toast--visible");

  toastHideTimer = setTimeout(() => {
    toast.classList.remove("toast--visible");
    toastHideTimer = null;
  }, timeout);
}

// TODO: заменить на реальный URL бэкенда (твой ngrok)
const ORDER_WEBHOOK_URL = "/api/orders/from-site";

let menuData = [];
let categoriesData = [];
let activeCategory = "Все";
let cart = [];
let currentModalItem = null;
let currentSelectedModifiers = [];

// --- Работа с localStorage ---
function loadCartFromStorage() {
  try {
    const savedCart = localStorage.getItem("zerna_cart");
    if (savedCart) {
      cart = JSON.parse(savedCart);
    }
  } catch (e) {
    console.error("Ошибка чтения корзины:", e);
    cart = [];
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem("zerna_cart", JSON.stringify(cart));
  } catch (e) {
    console.error("Ошибка сохранения корзины:", e);
  }
}

/* ===== Анкета мероприятия ===== */

const eventFieldIds = ["eventType", "eventFormat", "eventDate", "guestCount"];

function saveEventToStorage() {
  const eventData = {};

  eventFieldIds.forEach((id) => {
    const field = document.getElementById(id);
    if (field) {
      eventData[id] = field.value;
    }
  });

  try {
    localStorage.setItem("zerna_event", JSON.stringify(eventData));
  } catch (error) {
    console.error("Ошибка сохранения мероприятия:", error);
  }
}

function loadEventFromStorage() {
  try {
    const saved = localStorage.getItem("zerna_event");
    if (!saved) return;

    const eventData = JSON.parse(saved);

    eventFieldIds.forEach((id) => {
      const field = document.getElementById(id);
      if (field && typeof eventData[id] === "string") {
        field.value = eventData[id];
      }
    });
  } catch (error) {
    console.error("Ошибка загрузки мероприятия:", error);
  }
}

function updateEventSummary() {
  const summary = document.getElementById("eventSummaryText");
  if (!summary) return;

  const parts = [];

  const type = document.getElementById("eventType");
  const format = document.getElementById("eventFormat");
  const date = document.getElementById("eventDate");
  const guests = document.getElementById("guestCount");

  if (type?.value) {
    parts.push(type.options[type.selectedIndex].text);
  }

  if (format?.value) {
    parts.push(format.options[format.selectedIndex].text);
  }

  if (date?.value) {
    const [year, month, day] = date.value.split("-");
    parts.push(`${day}.${month}.${year}`);
  }

  const count = Number(guests?.value);

  if (Number.isInteger(count) && count > 0) {
    parts.push(`Гостей: ${count}`);
  }

  summary.textContent = parts.length
    ? parts.join(" · ")
    : "Укажите параметры мероприятия";
}

function focusEventField(fieldId) {
  const section = document.getElementById("eventSection");
  if (section) section.open = true;

  closeCart();

  requestAnimationFrame(() => {
    const field = document.getElementById(fieldId);
    if (!field) return;

    field.scrollIntoView({
      block: "center",
      behavior: "auto"
    });

    field.focus();
  });
}

function initEventForm() {
  loadEventFromStorage();

  const eventSection = document.getElementById("eventSection");

  if (eventSection) {
    eventSection.open = !window.matchMedia(
      "(max-width: 768px), (max-height: 500px) and (orientation: landscape)"
    ).matches;
  }

  updateEventSummary();

  // Запрещаем выбирать прошедшие даты
  const eventDateInput = document.getElementById("eventDate");

  if (eventDateInput) {
    const today = new Date();

    const todayString = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    eventDateInput.min = todayString;
  }

  eventFieldIds.forEach((id) => {
    const field = document.getElementById(id);

    if (field) {
      field.addEventListener("change", saveEventToStorage);
      field.addEventListener("input", saveEventToStorage);
      field.addEventListener("input", updateEventSummary);
      field.addEventListener("change", updateEventSummary);

      if (id === "guestCount") {
        field.addEventListener("input", renderCart);
        field.addEventListener("change", renderCart);
      }
    }
  });
}

function initDeliveryAddress() {
  const pickupType = document.getElementById("pickupType");
  const addressField = document.getElementById("deliveryAddressField");
  const addressInput = document.getElementById("deliveryAddress");

  if (!pickupType || !addressField || !addressInput) return;

  function updateDeliveryAddress() {
    const isDelivery = pickupType.value === "delivery";

    const timeLabel = document.getElementById("pickupTimeLabel");

    if (timeLabel) {
      timeLabel.textContent =
        pickupType.value === "delivery"
          ? "Желаемый интервал доставки *"
          : pickupType.value === "pickup"
            ? "Желаемый интервал самовывоза *"
            : "Желаемый интервал получения *";
    }

    addressField.hidden = !isDelivery;
    addressInput.required = isDelivery;

    if (!isDelivery) {
      addressInput.value = "";
    }
  }

  pickupType.addEventListener("change", updateDeliveryAddress);
  updateDeliveryAddress();
}

initEventForm();
initDeliveryAddress();

/* ===== Конец анкеты мероприятия ===== */

// --- Вспомогательные функции ---
function formatPrice(value) {
  return `${Number(value || 0)} ₽`;
}

function escapeHtml(text) {
  const s = String(text ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMenuSkeleton() {
  if (!menuGrid) return;
  const n = 6;
  const cards = Array.from({ length: n }, () => {
    return `
      <article class="menu-card menu-card--skeleton" aria-hidden="true">
        <div class="menu-card__image menu-card__image--skeleton"></div>
        <div class="menu-card__body">
          <div class="skeleton-line skeleton-line--short"></div>
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--tags"></div>
          <div class="skeleton-line skeleton-line--price"></div>
          <div class="skeleton-line skeleton-line--btn"></div>
        </div>
      </article>
    `;
  }).join("");
  menuGrid.innerHTML = cards;
}

function setPhoneMask() {
  if (!phoneInput) return;

  phoneInput.addEventListener("focus", () => {
    if (!phoneInput.value) {
      phoneInput.value = "+7 ";
    }
  });

  phoneInput.addEventListener("input", () => {
    let digits = phoneInput.value.replace(/\D/g, "");
    if (!digits.startsWith("7")) {
      digits = "7" + digits.replace(/^7*/, "");
    }
    digits = digits.substring(0, 11);

    let formatted = "+7";
    if (digits.length > 1) {
      formatted += " (";
      formatted += digits.substring(1, Math.min(4, digits.length));
    }
    if (digits.length >= 4) {
      formatted += ") ";
      formatted += digits.substring(4, Math.min(7, digits.length));
    }
    if (digits.length >= 7) {
      formatted += "-";
      formatted += digits.substring(7, Math.min(9, digits.length));
    }
    if (digits.length >= 9) {
      formatted += "-";
      formatted += digits.substring(9, Math.min(11, digits.length));
    }
    phoneInput.value = formatted;
  });
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("7");
}

// --- Управление корзиной (UI) ---

// --- MOBILE KEYBOARD MANAGEMENT ---

function initMobileKeyboard() {
  const viewport = window.visualViewport;

  if (!viewport || !cartPanel) return;

  const mobile = window.matchMedia(
    "(max-width: 1023px) and (pointer: coarse)"
  );

  const editableSelector =
    'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="date"]), textarea';

  let frame = 0;

  function resetKeyboardLayout() {
    cartPanel.classList.remove("keyboard-open");
    cartPanel.style.removeProperty("--keyboard-height");
    cartPanel.style.removeProperty("--keyboard-bottom");
  }

  function updateKeyboardLayout() {
    frame = 0;

    const field = document.activeElement;
    const layoutHeight =
      document.documentElement.clientHeight;

    const bottomOffset = Math.max(
      0,
      layoutHeight - viewport.height - viewport.offsetTop
    );

    const keyboardVisible =
      layoutHeight - viewport.height > 100;

    if (
      !mobile.matches ||
      !cartPanel.classList.contains("is-open") ||
      !field ||
      !cartPanel.contains(field) ||
      !field.matches(editableSelector) ||
      !keyboardVisible ||
      Math.abs(viewport.scale - 1) > 0.05
    ) {
      resetKeyboardLayout();
      return;
    }

    cartPanel.style.setProperty(
      "--keyboard-height",
      `${Math.max(0, viewport.height - 12)}px`
    );

    cartPanel.style.setProperty(
      "--keyboard-bottom",
      `${bottomOffset}px`
    );

    cartPanel.classList.add("keyboard-open");

    const panelRect = cartPanel.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();

    const visibleTop =
      Math.max(panelRect.top, viewport.offsetTop) + 12;

    const visibleBottom =
      Math.min(
        panelRect.bottom,
        viewport.offsetTop + viewport.height
      ) - 16;

    if (fieldRect.top < visibleTop) {
      cartPanel.scrollTop += fieldRect.top - visibleTop;
    } else if (fieldRect.bottom > visibleBottom) {
      cartPanel.scrollTop += Math.min(
        fieldRect.bottom - visibleBottom,
        fieldRect.top - visibleTop
      );
    }
  }

  function scheduleKeyboardUpdate() {
    if (frame) return;
    frame = requestAnimationFrame(updateKeyboardLayout);
  }

  viewport.addEventListener(
    "resize", scheduleKeyboardUpdate
  );

  viewport.addEventListener(
    "scroll", scheduleKeyboardUpdate
  );

  window.addEventListener(
    "resize", scheduleKeyboardUpdate
  );

  cartPanel.addEventListener(
    "focusin", scheduleKeyboardUpdate
  );

  cartPanel.addEventListener(
    "focusout", scheduleKeyboardUpdate
  );
}

function openCart() {
  if (cartPanel) cartPanel.classList.add("is-open");
  if (cartOverlay) cartOverlay.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeCart() {
  if (cartPanel) {
    const activeField = document.activeElement;

    if (activeField && cartPanel.contains(activeField)) {
      activeField.blur();
    }

    cartPanel.classList.remove("keyboard-open");
    cartPanel.style.removeProperty("--keyboard-height");
    cartPanel.style.removeProperty("--keyboard-bottom");
  }

  if (cartPanel) cartPanel.classList.remove("is-open");
  if (cartOverlay) cartOverlay.hidden = true;
  document.body.style.overflow = "";
}

function getTagLabels(tags = []) {
  const labels = {
    vegan: "Веган",
    vegetarian: "Вегетарианское",
    "gluten-free": "Без глютена",
  };
  return tags
    .filter((tag) => tag !== "new")
    .map((tag) => `<span class="tag">${escapeHtml(labels[tag] || tag)}</span>`)
    .join("");
}

function getVisibleItems() {
  if (activeCategory === "Все") return menuData;
  return menuData.filter((item) => item.category === activeCategory);
}

function renderCategories() {
  const list = ["Все", ...categoriesData];
  if (!categoriesList) return;

  categoriesList.innerHTML = list
    .map((category) => {
      const activeClass = category === activeCategory ? "active" : "";
      return `<button class="category-chip ${activeClass}" type="button" data-category="${category}">${category}</button>`;
    })
    .join("");
}

function getProductCartQuantity(productId) {
  return cart.reduce((sum, item) => {
    const originalId = item.originalId ?? item.id;

    return String(originalId) === String(productId)
      ? sum + item.quantity
      : sum;
  }, 0);
}

function renderProductCartControl(productId) {
  const quantity = getProductCartQuantity(productId);

  if (quantity === 0) {
    return `
      <button class="primary-btn add-btn"
        type="button" data-add-id="${productId}">
        Добавить
      </button>
    `;
  }

  return `
    <div class="menu-stepper">
      <button type="button"
        data-menu-minus="${productId}"
        aria-label="Уменьшить количество">−</button>

      <span class="menu-stepper__value">
        <strong>${quantity} шт.</strong>
        <small>В корзине</small>
      </span>

      <button type="button"
        data-add-id="${productId}"
        aria-label="Увеличить количество">+</button>
    </div>
  `;
}

function updateMenuCartControls() {
  if (!menuGrid) return;

  menuGrid.querySelectorAll("[data-cart-control]").forEach((element) => {
    const productId = Number(element.dataset.cartControl);
    const quantity = getProductCartQuantity(productId);

    if (element.dataset.quantity === String(quantity)) return;

    element.innerHTML = renderProductCartControl(productId);
    element.dataset.quantity = String(quantity);
  });
}

function decreaseProductFromMenu(productId) {
  const matchingItems = cart.filter(
    (item) =>
      String(item.originalId ?? item.id) === String(productId)
  );

  const item =
    matchingItems.find((item) => item.id === String(productId)) ||
    matchingItems[matchingItems.length - 1];

  if (item) decreaseCartItem(item.id);
}

function renderMenu(items) {
  if (!menuGrid) return;
  if (!items.length) {
    menuGrid.innerHTML = `<div class="cart-empty"><p>В этой категории пока нет позиций.</p></div>`;
    return;
  }

  menuGrid.innerHTML = items
    .map((item) => {
      const hasBadge = item.tags?.includes("new");
      const tagsHtml = getTagLabels(item.tags || []);

      return `
        <article class="menu-card">
          ${hasBadge ? '<span class="menu-badge">Новинка</span>' : ""}
          <div class="menu-card__image">
            ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">` : `<div class="menu-card__placeholder" role="img" aria-label="Фото появится позже"><span class="menu-card__placeholder-icon" aria-hidden="true"></span><span class="menu-card__placeholder-text">Фото скоро</span></div>`}
          </div>
          <div class="menu-card__body">
            <p class="menu-card__category">${escapeHtml(item.category)}</p>
            <h3>${escapeHtml(item.name)}</h3>
            ${tagsHtml ? `<div class="tags-row">${tagsHtml}</div>` : '<div class="tags-row tags-row--empty"></div>'}
            <div class="menu-card__footer">
              <p class="menu-card__price">${formatPrice(item.price)}</p>
              <div class="menu-card__actions">
                <button class="secondary-btn details-btn" type="button" data-id="${item.id}">Подробнее</button>
                <div class="menu-cart-control"
                  data-cart-control="${item.id}"
                  data-quantity="${getProductCartQuantity(item.id)}">
                  ${renderProductCartControl(item.id)}
                </div>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderNutrition(nutrition = {}) {
  if (!modalNutrition) return;
  const values = [
    { label: "Ккал", value: nutrition["ккал"] || "Уточняется" },
    { label: "Белки", value: nutrition["белки"] || "—" },
    { label: "Жиры", value: nutrition["жиры"] || "—" },
    { label: "Углеводы", value: nutrition["углеводы"] || "—" },
  ];
  modalNutrition.innerHTML = values
    .map(
      (item) =>
        `<div class="nutrition-card"><span class="nutrition-card__label">${item.label}</span><strong class="nutrition-card__value">${item.value}</strong></div>`,
    )
    .join("");
}

function renderAllergens(allergens = []) {
  if (!modalAllergens) return;
  if (!allergens.length) {
    modalAllergens.innerHTML =
      '<p class="empty-text">Явные аллергены не указаны.</p>';
    return;
  }
  modalAllergens.innerHTML = allergens
    .map((item) => `<span class="allergen-tag">${escapeHtml(item)}</span>`)
    .join("");
}

function openProductModal(item) {
  currentModalItem = item;
  currentSelectedModifiers = [];

  if (modalImage) {
    modalImage.innerHTML = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">`
      : `<div class="product-modal__image-placeholder" role="img" aria-label="Фото появится позже"><span class="menu-card__placeholder-icon" aria-hidden="true"></span><span class="menu-card__placeholder-text">Фото скоро</span></div>`;
  }

  if (modalCategory) modalCategory.textContent = item.category || "";
  if (modalTitle) modalTitle.textContent = item.name || "";
  if (modalDescription)
    modalDescription.textContent = item.description || "Описание уточняется.";
  if (modalPrice) modalPrice.textContent = formatPrice(item.price || 0);

  if (modalComposition) {
    modalComposition.innerHTML = (item.composition || [])
      .map((point) => `<li>${escapeHtml(point)}</li>`)
      .join("");
  }

  renderNutrition(item.nutrition || {});
  renderAllergens(item.allergens || []);

  if (modalNoteWrap && modalNote) {
    if (item.note) {
      modalNote.textContent = item.note;
      modalNoteWrap.style.display = "block";
    } else {
      modalNote.textContent = "";
      modalNoteWrap.style.display = "none";
    }
  }

  // Рендер модификаторов (добавок)
  const modWrap = document.getElementById("modalModifiersWrap");
  const modContainer = document.getElementById("modalModifiers");

  if (item.modifiers && item.modifiers.length > 0) {
    modWrap.style.display = "block";
    modContainer.innerHTML = item.modifiers
      .map(
        (mod) => `
      <label class="modifier-item">
        <input type="checkbox" value="${mod.id}" data-price="${mod.price}" data-name="${escapeHtml(mod.name)}">
        <span class="modifier-name">${escapeHtml(mod.name)}</span>
        <span class="modifier-price">+${formatPrice(mod.price)}</span>
      </label>
    `,
      )
      .join("");

    const checkboxes = modContainer.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      cb.addEventListener("change", updateModalPrice);
    });
  } else {
    modWrap.style.display = "none";
    modContainer.innerHTML = "";
  }

  if (productModal && typeof productModal.showModal === "function") {
    productModal.showModal();
  }
}

function updateModalPrice() {
  if (!currentModalItem) return;
  const modContainer = document.getElementById("modalModifiers");
  const checkboxes = modContainer.querySelectorAll(
    'input[type="checkbox"]:checked',
  );

  let extraPrice = 0;
  currentSelectedModifiers = [];

  checkboxes.forEach((cb) => {
    extraPrice += Number(cb.dataset.price);
    currentSelectedModifiers.push({
      id: cb.value,
      name: cb.dataset.name,
      price: Number(cb.dataset.price),
    });
  });

  const totalPrice = currentModalItem.price + extraPrice;
  if (modalPrice) modalPrice.textContent = formatPrice(totalPrice);
}

function closeModal() {
  if (productModal && productModal.open) {
    productModal.close();
  }
  currentModalItem = null;
}

function addToCart(itemId, modifiers = []) {
  const product = menuData.find((item) => item.id === itemId);
  if (!product) return;

  const modIds = modifiers
    .map((m) => m.id)
    .sort()
    .join("-");
  const cartItemId = modIds ? `${itemId}_${modIds}` : `${itemId}`;
  const modsPrice = modifiers.reduce((sum, m) => sum + m.price, 0);
  const finalPrice = product.price + modsPrice;
  const modsNames = modifiers.map((m) => m.name).join(", ");
  const finalName = modsNames ? `${product.name} (${modsNames})` : product.name;

  const existing = cart.find((item) => item.id === cartItemId);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: cartItemId,
      originalId: product.id,
      name: finalName,
      category: product.category,
      price: finalPrice,
      quantity: 1,
    });
  }

  renderCart();
  showToast("Добавлено в корзину", 2000, product.name);
}

function increaseCartItem(itemId) {
  const item = cart.find((product) => product.id === itemId);
  if (!item) return;
  item.quantity += 1;
  renderCart();
}

function decreaseCartItem(itemId) {
  const item = cart.find((product) => product.id === itemId);
  if (!item) return;
  item.quantity -= 1;
  if (item.quantity <= 0) {
    cart = cart.filter((product) => product.id !== itemId);
  }
  renderCart();
}

function removeCartItem(itemId) {
  cart = cart.filter((item) => item.id !== itemId);
  renderCart();
}

function getCartTotals() {
  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );
  return { totalCount, totalPrice };
}

function renderCart() {
  const { totalCount, totalPrice } = getCartTotals();
  if (!cartItems) return;
    if (checkoutForm) {
    checkoutForm.hidden = cart.length === 0;
  }

  if (clearCartBtn) {
    clearCartBtn.hidden = cart.length === 0;
  }

  if (!cart.length) {
    cartItems.innerHTML = `
  <div class="cart-empty">
    <p>Ваша корзина пока пуста.</p>
    <button type="button" class="primary-btn" id="returnToMenuBtn">
      Перейти к меню
    </button>
  </div>
`;

document.getElementById("returnToMenuBtn")
  ?.addEventListener("click", () => {
    closeCart();

    requestAnimationFrame(() => {
      const menu = document.getElementById("menuGrid");
      if (!menu) return;

      const header = document.querySelector(".site-header");
      const headerHeight = header?.offsetHeight || 0;

      const targetPosition =
        menu.getBoundingClientRect().top +
        window.scrollY -
        headerHeight -
        12;

      window.scrollTo({
        top: Math.max(0, targetPosition),
        behavior: "smooth"
      });
    });
  });
  } else {
    cartItems.innerHTML = cart
      .map((item) => {
        const itemSum = item.price * item.quantity;
        return `
        <article class="cart-item">
          <div class="cart-item__top">
            <div>
              <p class="cart-item__category">${item.category}</p>
              <h3 class="cart-item__title">${item.name}</h3>
            </div>
            <button class="cart-item__remove" type="button" data-remove-id="${item.id}" aria-label="Удалить позицию">✕</button>
          </div>
          <div class="cart-item__bottom">
            <div class="cart-stepper">
              <button class="cart-stepper__btn" type="button" data-decrease-id="${item.id}" aria-label="Уменьшить количество">−</button>
              <span class="cart-stepper__value">${item.quantity}</span>
              <button class="cart-stepper__btn" type="button" data-increase-id="${item.id}" aria-label="Увеличить количество">+</button>
            </div>
            <strong class="cart-item__sum">${formatPrice(itemSum)}</strong>
          </div>
        </article>
      `;
      })
      .join("");
  }

  if (cartCount) cartCount.textContent = totalCount;
  if (cartTotalCount) cartTotalCount.textContent = totalCount;
  if (cartTotalPrice) cartTotalPrice.textContent = formatPrice(totalPrice);

  const guestCount = Number(document.getElementById("guestCount")?.value) || 0;

  if (cartGuestCount) {
    cartGuestCount.textContent = guestCount > 0 ? guestCount : "—";
  }

  if (cartPricePerGuest) {
    cartPricePerGuest.textContent =
      guestCount > 0 && totalCount > 0
        ? `${(totalPrice / guestCount).toLocaleString("ru-RU", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })} ₽`
        : "—";
  }

  if (mobileCartBtn) {
    mobileCartBtn.textContent = totalCount
      ? `Корзина · ${formatPrice(totalPrice)}`
      : "Корзина · 0 ₽";
  }

  saveCartToStorage();
  bindCartItemActions();
  updateMenuCartControls();
}

function bindCategoryActions() {
  const categoryButtons = document.querySelectorAll("[data-category]");
  categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderCategories();
      renderMenu(getVisibleItems());
      bindCategoryActions();
      bindMenuActions();
    });
  });
}

function bindMenuActions() {
  if (!menuGrid) return;

  menuGrid.onclick = (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    if (button.hasAttribute("data-add-id")) {
      addToCart(Number(button.dataset.addId));
      return;
    }

    if (button.hasAttribute("data-menu-minus")) {
      decreaseProductFromMenu(Number(button.dataset.menuMinus));
      return;
    }

    if (button.classList.contains("details-btn")) {
      const itemId = Number(button.dataset.id);
      const item = menuData.find(
        (product) => product.id === itemId
      );

      if (item) openProductModal(item);
    }
  };
}

function bindCartItemActions() {
  const increaseButtons = document.querySelectorAll("[data-increase-id]");
  const decreaseButtons = document.querySelectorAll("[data-decrease-id]");
  const removeButtons = document.querySelectorAll("[data-remove-id]");

  increaseButtons.forEach((button) => {
    button.addEventListener("click", () =>
      increaseCartItem(button.dataset.increaseId),
    );
  });
  decreaseButtons.forEach((button) => {
    button.addEventListener("click", () =>
      decreaseCartItem(button.dataset.decreaseId),
    );
  });
  removeButtons.forEach((button) => {
    button.addEventListener("click", () =>
      removeCartItem(button.dataset.removeId),
    );
  });
}

function setFormStatus(message = "", type = "") {
  if (!checkoutForm) return;
  let statusEl = checkoutForm.querySelector(".form-status");
  if (!statusEl) {
    statusEl = document.createElement("p");
    statusEl.className = "form-status";
    checkoutForm.appendChild(statusEl);
  }
  statusEl.textContent = message;
  statusEl.className = "form-status";
  if (type) {
    statusEl.classList.add(`is-${type}`);
  }
}

function getEventFormData() {
  return {
    type: document.getElementById("eventType")?.value || "",
    format: document.getElementById("eventFormat")?.value || "",
    date: document.getElementById("eventDate")?.value || "",
    guestCount: Number(document.getElementById("guestCount")?.value || 0),
  };
}

function getOrderFormData() {
  const name = document.getElementById("orderName")?.value.trim() || "";
  const phone = document.getElementById("phone")?.value.trim() || "";
  const vk = document.getElementById("orderVk")?.value.trim() || "";
  const pickupType = document.getElementById("pickupType")?.value || "";
  const pickupTime = document.getElementById("pickupTime")?.value || "";

  const deliveryAddress =
    pickupType === "delivery"
      ? document.getElementById("deliveryAddress")?.value.trim() || ""
      : "";

  const comment = document.getElementById("orderComment")?.value.trim() || "";
  const policyAccepted =
    document.getElementById("orderPolicy")?.checked || false;
  const vkNotify = document.getElementById("orderVkNotify")?.checked || false;
  const totals = getCartTotals();

  return {
    customer: { name, phone, vk },
    order: {
      pickupType,
      pickupTime,
      deliveryAddress,
      comment,
      items: cart.map((item) => ({
        id: String(item.originalId ?? item.id),
        name: item.name,
        category: item.category,
        price: item.price,
        quantity: item.quantity,
        total: item.price * item.quantity,
      })),
      totalCount: totals.totalCount,
      totalPrice: totals.totalPrice,
      event: getEventFormData(),
    },
    consents: { policyAccepted, vkNotify },
    meta: { source: "website" },
  };
}

function showOrderSuccess(responseData = {}) {
  if (checkoutForm) checkoutForm.hidden = true;
  if (orderSuccess) orderSuccess.hidden = false;
  if (successOrderId)
    successOrderId.textContent =
      responseData.orderId || "Будет присвоен оператором";
  if (orderSuccessText) {
    orderSuccessText.textContent =
      responseData.message ||
      "Спасибо! Мы получили вашу заявку и скоро свяжемся с вами.";
  }
}

function resetOrderFlow() {
  if (checkoutForm) {
    checkoutForm.reset();
    checkoutForm.hidden = false;
  }
  if (orderSuccess) orderSuccess.hidden = true;
  setSubmitOrderLoading(false);
  orderSubmitInFlight = false;
  setFormStatus("", "");
  cart = [];
  renderCart();
  closeCart();
}

function getApiErrorMessage(result, status) {
  const detail = result?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((entry) =>
        typeof entry?.msg === "string" ? entry.msg : String(entry?.msg ?? ""),
      )
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  if (typeof result?.message === "string" && result.message)
    return result.message;
  return `Ошибка отправки: ${status}`;
}

async function submitOrder(orderData) {
  const response = await fetch(ORDER_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(orderData),
  });

  let result = {};
  try {
    result = await response.json();
  } catch (error) {
    result = {};
  }

  if (!response.ok) {
    console.error("Ошибка API:", response.status);
 

    throw new Error(getApiErrorMessage(result, response.status));
  }
  return result;
}

function bindStaticActions() {
  if (cartToggle) cartToggle.addEventListener("click", openCart);
  if (mobileCartBtn) mobileCartBtn.addEventListener("click", openCart);
  if (closeCartBtn) closeCartBtn.addEventListener("click", closeCart);
  if (cartOverlay) cartOverlay.addEventListener("click", closeCart);

  if (clearCartBtn) {
    clearCartBtn.addEventListener("click", () => {
      cart = [];
      renderCart();
    });
  }

  if (checkoutBtn) checkoutBtn.addEventListener("click", openCart);

  if (closeProductModal)
    closeProductModal.addEventListener("click", closeModal);

  if (productModal) {
    productModal.addEventListener("click", (event) => {
      const dialog = productModal.querySelector(".product-modal__dialog");
      if (!dialog) return;
      const rect = dialog.getBoundingClientRect();
      const clickedInside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!clickedInside) closeModal();
    });
    productModal.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeModal();
    });
  }

  if (modalAddToCart) {
    modalAddToCart.addEventListener("click", () => {
      if (!currentModalItem) return;
      addToCart(currentModalItem.id, currentSelectedModifiers);
      closeModal();
    });
  }

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!cart.length) {
        setFormStatus("Корзина пока пуста.", "error");
        return;
      }

      const orderData = getOrderFormData();

      // Проверяем дату мероприятия
      const eventDate = orderData.order.event?.date;

      if (!eventDate) {
        showToast(
          "Не указана дата мероприятия",
          6000,
          "Пожалуйста, выберите дату проведения мероприятия.",
        );
        focusEventField("eventDate");
        return;
      }

      const today = new Date();
      const todayString = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");

      if (eventDate < todayString) {
        showToast(
          "Неверная дата мероприятия",
          6000,
          "Выберите сегодняшнюю или будущую дату.",
        );
        focusEventField("eventDate");
        return;
      }
      // Проверяем количество гостей
      const guestCount = Number(orderData.order.event?.guestCount);

      if (!Number.isInteger(guestCount) || guestCount < 1) {
        showToast(
          "Неверное количество гостей",
          6000,
          "Укажите целое число гостей, не меньше 1.",
        );
        focusEventField("guestCount");
        return;
      }
      if (
        !orderData.customer.name ||
        !orderData.customer.phone ||
        !orderData.order.pickupType ||
        !orderData.order.pickupTime
      ) {
        setFormStatus("Пожалуйста, заполните обязательные поля.", "error");
        return;
      }

      if (!isValidPhone(orderData.customer.phone)) {
        setFormStatus("Введите полный номер телефона: +7 и 10 цифр.", "error");
        return;
      }

      if (!orderData.consents.policyAccepted) {
        setFormStatus("Нужно согласие на обработку заявки.", "error");
        return;
      }

      if (orderSubmitInFlight) return;
      orderSubmitInFlight = true;
      setSubmitOrderLoading(true);

      try {
        setFormStatus("Отправляем заказ...", "");
        const result = await submitOrder(orderData);

        resetOrderFlow();

        showToast(
          "Заказ успешно принят!",
          12000,
          `Номер заявки: ${result.orderId || "уточнит менеджер"}. Мы свяжемся с вами для подтверждения.`,
        );
        } catch (error) {
        console.error(error);

        const message = error instanceof TypeError
          ? "Не удалось связаться с сервером. Проверьте интернет-соединение. Данные заказа сохранены."
          : error.message || "Не удалось отправить заказ. Попробуйте ещё раз.";

        setFormStatus(message, "error");
        showToast("Ошибка отправки", 8000, message);

      } finally {
        orderSubmitInFlight = false;
        if (checkoutForm && !checkoutForm.hidden) setSubmitOrderLoading(false);
      }
    });
  }

  if (newOrderBtn) newOrderBtn.addEventListener("click", resetOrderFlow);
}

async function loadMenu() {
  renderMenuSkeleton();
  if (categoriesList)
    categoriesList.innerHTML = `<p class="categories-loading">Загрузка меню…</p>`;

  try {
    const response = await fetch("./data/menu.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    categoriesData = data.categories || [];
    menuData = data.items || [];

    renderCategories();
    renderMenu(getVisibleItems());
    renderCart();
    bindCategoryActions();
    bindMenuActions();
  } catch (error) {
    console.error("Ошибка загрузки меню:", error);
    if (categoriesList) categoriesList.innerHTML = "";
    if (menuGrid)
      menuGrid.innerHTML = `<div class="cart-empty"><p>Не удалось загрузить меню. Проверьте файл data/menu.json.</p></div>`;
  }
}

// --- ИНТЕГРАЦИЯ С TELEGRAM ---

function loadTelegramWebApp() {
  if (window.Telegram?.WebApp) {
    initTelegramWebApp();
    return;
  }

  const script = document.createElement("script");

  script.src =
    "https://telegram.org/js/telegram-web-app.js";

  script.async = true;

  script.onload = () => {
    initTelegramWebApp();
  };

  script.onerror = () => {
    console.warn("Telegram Web App is unavailable");
  };

  document.head.appendChild(script);
}

function initTelegramWebApp() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.expand();

    // Пытаемся подставить имя с небольшой задержкой
    setTimeout(() => {
      if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        const user = tg.initDataUnsafe.user;
        const nameInput = document.getElementById("orderName");

        if (nameInput && !nameInput.value) {
          nameInput.value = user.first_name || "";
        }
      }
    }, 500);
  }
}

function initCompactHeader() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const mobile = window.matchMedia(
    "(max-width: 768px)"
  );

  const landscape = window.matchMedia(
    "(orientation: landscape) and (max-height: 500px) and (max-width: 1023px)"
  );

  let scheduled = false;

  function updateHeader() {
    scheduled = false;

    const scrollY = Math.max(0, window.scrollY);
    const compact = header.classList.contains("is-compact");

    const shouldCompact = landscape.matches ||
      (mobile.matches &&
        (compact ? scrollY > 40 : scrollY > 150));

    if (compact === shouldCompact) return;

    const oldHeight = header.offsetHeight;

    header.classList.toggle("is-compact", shouldCompact);

    const heightDifference = header.offsetHeight - oldHeight;

    if (shouldCompact && scrollY > oldHeight) {
      window.scrollTo({
        top: Math.max(0, scrollY + heightDifference),
        behavior: "instant"
      });
    }
  }

  function scheduleUpdate() {
    if (scheduled) return;

    scheduled = true;
    requestAnimationFrame(updateHeader);
  }

  window.addEventListener("scroll", scheduleUpdate, {
    passive: true
  });

  window.addEventListener("resize", scheduleUpdate);

  updateHeader();
}

// --- Инициализация при запуске ---
initCompactHeader();
initMobileKeyboard();
loadCartFromStorage();
bindStaticActions();
loadMenu();
setPhoneMask();
loadTelegramWebApp();
