function enhanceCard(card) {
  if (!(card instanceof HTMLElement) || card.dataset.premiumReady === "true") return;
  card.classList.add("premium-card");

  const mnemonic = card.querySelector(':scope > [data-section="mnemonic"]');
  const words = card.querySelector(':scope > [data-section="words"]');
  const examples = card.querySelector(':scope > [data-section="examples"]');
  const readings = card.querySelector(':scope > [data-section="readings"]');
  const structure = card.querySelector(':scope > [data-section="structure"]');

  mnemonic?.classList.add("premium-mnemonic");
  words?.classList.add("premium-words");
  examples?.classList.add("premium-examples");
  readings?.classList.add("premium-readings");
  structure?.classList.add("premium-structure");

  card.dataset.premiumReady = "true";
}

function enhanceInterface(root = document) {
  root.querySelectorAll?.(".full-card").forEach(enhanceCard);
}

const premiumObserver = new MutationObserver(records => {
  records.forEach(record => {
    record.addedNodes.forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches(".full-card")) enhanceCard(node);
      node.querySelectorAll?.(".full-card").forEach(enhanceCard);
    });
  });
});

premiumObserver.observe(document.body, { childList: true, subtree: true });
enhanceInterface();
