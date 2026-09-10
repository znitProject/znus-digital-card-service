(() => {
  "use strict";

  const CONFIG = {
    companyUrl: "https://znus.co.kr",
    phone: "01012345678",
    companyPhone: "0319964823",
    fax: "0319964824",
    email: "hello@znus.co.kr",
    address: "경기도 김포시 장차로5번길 20 4층 ZNUS",
    loadingDuration: 2200,
    toastDuration: 1800
  };

  const DOM = {
    intro: document.querySelector("#intro"),
    main: document.querySelector("#main"),
    loadingArea: document.querySelector(".loading-area"),
    loadingProgress: document.querySelector("#loading-progress"),
    loadingText: document.querySelector("#loading-text"),
    rocket: document.querySelector("#rocket"),
    introStack: document.querySelector("#intro-stack"),
    introPerson: document.querySelector("#intro-person"),
    introHint: document.querySelector("#intro-hint"),
    logoButton: document.querySelector("#logo-button"),
    navDots: document.querySelectorAll(".nav-dot"),
    cards: document.querySelectorAll(".screen-card"),
    heartButton: document.querySelector("#heart-button"),
    languageButton: document.querySelector("#language-button"),
    homeButton: document.querySelector("#home-button"),
    shareButton: document.querySelector("#share-button"),
    directionButton: document.querySelector("#direction-button"),
    toast: document.querySelector("#toast"),
    mapModal: document.querySelector("#map-modal"),
    modalClose: document.querySelector("#modal-close"),
    kakaoMap: document.querySelector("#kakao-map"),
    naverMap: document.querySelector("#naver-map"),
    qrCode: document.querySelector("#qr-code")
  };

  const state = {
    introComplete: false,
    introSpread: false,
    currentCard: 0,
    language: "ko",
    toastTimer: null,
    touchStartY: 0
  };

  function init() {
    bindEvents();
    startIntro();
    createQRCode();
    setupIntersectionObserver();
  }

  function bindEvents() {
    DOM.logoButton.addEventListener("click", () => window.location.reload());
    DOM.intro.addEventListener("pointerdown", handleIntroInteraction, { passive: true });

    DOM.navDots.forEach(dot => {
      dot.addEventListener("click", () => goToCard(Number(dot.dataset.target)));
    });

    DOM.heartButton.addEventListener("click", createHeartBurst);
    DOM.languageButton.addEventListener("click", toggleLanguage);

    DOM.homeButton.addEventListener("click", () => {
      window.open(CONFIG.companyUrl, "_blank", "noopener,noreferrer");
    });

    document.querySelectorAll("[data-copy]").forEach(button => {
      button.addEventListener("click", async () => {
        const value = button.dataset.copy;
        await copyToClipboard(value);
        showToast(value.includes("@") ? "주소가 복사되었습니다" : "번호가 복사되었습니다");
      });
    });

    DOM.shareButton.addEventListener("click", shareProfile);
    DOM.directionButton.addEventListener("click", openMapModal);
    DOM.modalClose.addEventListener("click", closeMapModal);
    DOM.mapModal.querySelector(".modal-backdrop").addEventListener("click", closeMapModal);
    DOM.kakaoMap.addEventListener("click", openKakaoMap);
    DOM.naverMap.addEventListener("click", openNaverMap);

    window.addEventListener("keydown", event => {
      if (event.key === "Escape") closeMapModal();
    });

    DOM.main.addEventListener("touchstart", event => {
      state.touchStartY = event.changedTouches[0].clientY;
    }, { passive: true });

    DOM.main.addEventListener("touchend", event => {
      const endY = event.changedTouches[0].clientY;
      const diff = state.touchStartY - endY;
      if (Math.abs(diff) < 50) return;
      goToCard(state.currentCard + (diff > 0 ? 1 : -1));
    }, { passive: true });
  }

  function startIntro() {
    const start = performance.now();

    function animate(now) {
      const progress = Math.min((now - start) / CONFIG.loadingDuration, 1);
      const percentage = Math.round(progress * 100);

      DOM.loadingProgress.style.width = `${percentage}%`;
      DOM.rocket.style.left = `${percentage}%`;
      DOM.loadingText.textContent = `${percentage}%`;

      if (progress < 1) requestAnimationFrame(animate);
      else finishLoading();
    }

    requestAnimationFrame(animate);
  }

  function finishLoading() {
    DOM.loadingArea.classList.add("complete");
    setTimeout(() => DOM.introStack.classList.add("ready"), 350);
    setTimeout(() => DOM.introPerson.classList.add("visible"), 900);
    setTimeout(() => DOM.introHint.classList.add("visible"), 1700);
  }

  function handleIntroInteraction() {
    if (state.introComplete || !DOM.introStack.classList.contains("ready")) return;

    state.introSpread = true;
    DOM.introStack.classList.remove("ready");
    DOM.introStack.classList.add("spread");
    DOM.introHint.classList.remove("visible");

    setTimeout(() => DOM.introPerson.classList.remove("visible"), 250);
    setTimeout(enterMain, 1100);
  }

  function enterMain() {
    state.introComplete = true;
    DOM.main.classList.add("active");
    DOM.cards[0].classList.add("is-active");
    DOM.intro.classList.add("is-hidden");
  }

  function setupIntersectionObserver() {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const card = entry.target;
        const index = Number(card.dataset.index);
        state.currentCard = index;
        activateCard(card);
        updateNavigation(index);
      });
    }, { root: DOM.main, threshold: 0.65 });

    DOM.cards.forEach(card => observer.observe(card));
  }

  function activateCard(card) {
    DOM.cards.forEach(item => {
      if (item !== card) item.classList.remove("is-active");
    });
    card.classList.add("is-active");
  }

  function updateNavigation(index) {
    DOM.navDots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === index);
    });
  }

  function goToCard(index) {
    const target = Math.max(0, Math.min(DOM.cards.length - 1, index));
    DOM.cards[target].scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createHeartBurst(event) {
    event?.stopPropagation();
    const count = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < count; i++) setTimeout(createHeart, i * 80);
  }

  function createHeart() {
    const heart = document.createElement("span");
    heart.className = "floating-heart";
    heart.textContent = "♥";

    const x = Math.random() * 160 - 80;
    const y = Math.random() * -180 - 40;

    heart.style.left = `${50 + Math.random() * 10 - 5}%`;
    heart.style.top = `${50 + Math.random() * 10 - 5}%`;
    heart.style.setProperty("--x", `${x}px`);
    heart.style.setProperty("--y", `${y}px`);

    document.body.appendChild(heart);
    heart.addEventListener("animationend", () => heart.remove());
  }

  function toggleLanguage(event) {
    event.stopPropagation();
    state.language = state.language === "ko" ? "en" : "ko";

    document.querySelectorAll("[data-ko][data-en]").forEach(element => {
      element.textContent = element.dataset[state.language];
    });
  }

  async function copyToClipboard(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand("copy"); } catch {}
      textarea.remove();
      return true;
    }
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    DOM.toast.querySelector("span").textContent = message;
    DOM.toast.classList.add("show");

    state.toastTimer = setTimeout(() => {
      DOM.toast.classList.remove("show");
    }, CONFIG.toastDuration);
  }

  async function shareProfile() {
    const shareData = {
      title: "ZNUS Profile",
      text: "ZNUS Digital Profile",
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error.name !== "AbortError") showToast("공유할 수 없습니다");
      }
      return;
    }

    await copyToClipboard(window.location.href);
    showToast("페이지 주소가 복사되었습니다");
  }

  function createQRCode() {
    if (!DOM.qrCode || typeof QRCode === "undefined") return;

    DOM.qrCode.innerHTML = "";
    new QRCode(DOM.qrCode, {
      text: window.location.href,
      width: 160,
      height: 160,
      colorDark: "#050505",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  function openMapModal() {
    DOM.mapModal.classList.add("open");
    DOM.mapModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeMapModal() {
    DOM.mapModal.classList.remove("open");
    DOM.mapModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function openKakaoMap() {
    const encoded = encodeURIComponent(CONFIG.address);
    window.open(`https://map.kakao.com/?q=${encoded}`, "_blank", "noopener,noreferrer");
  }

  function openNaverMap() {
    const encoded = encodeURIComponent(CONFIG.address);
    window.open(`https://map.naver.com/p/search/${encoded}`, "_blank", "noopener,noreferrer");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
