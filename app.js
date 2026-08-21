const UNIT_PRICE = 100;
const quantityButtons = [...document.querySelectorAll("[data-quantity]")];
const lineItem = document.querySelector("#line-item");
const totalLabel = document.querySelector("#total");
const modal = document.querySelector("#modal");
const demoCopy = document.querySelector("#demo-copy");
let quantity = 1;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function selectQuantity(nextQuantity) {
  quantity = nextQuantity;
  quantityButtons.forEach((button) => {
    const selected = Number(button.dataset.quantity) === quantity;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  lineItem.textContent = `Pack Arcade Crew × ${quantity}`;
  totalLabel.textContent = clp.format(UNIT_PRICE * quantity);
}

quantityButtons.forEach((button) => {
  button.addEventListener("click", () => selectQuantity(Number(button.dataset.quantity)));
});

document.querySelector("#pay-button").addEventListener("click", () => {
  const noun = quantity === 1 ? "pack" : "packs";
  demoCopy.innerHTML = `Seleccionaste ${quantity} ${noun} por un total de <strong>${clp.format(UNIT_PRICE * quantity)}</strong>. En la siguiente etapa, este botón pedirá al servidor que cree la preferencia de pago.`;
  modal.hidden = false;
  document.querySelector("#modal-close").focus();
});

function closeModal() {
  modal.hidden = true;
  document.querySelector("#pay-button").focus();
}

document.querySelector("#modal-close").addEventListener("click", closeModal);
document.querySelector("#modal-action").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.hidden) closeModal();
});
