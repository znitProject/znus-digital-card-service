/* Data adapter for the supplied design. All user text goes through textContent. */
window.ZNUS = (() => {
  let card;
  const objects = [];
  const text = (selector, value) => document.querySelectorAll(selector).forEach(el => { el.textContent = value || ''; });
  const rpc = (method, ...args) => new Promise((resolve, reject) => {
    if (window.ZNUS_DEMO) return resolve(method.endsWith('Media') ? null : window.ZNUS_DEMO);
    google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[method](...args);
  });
  function failure(error) {
    document.body.style.visibility = 'visible';
    document.body.replaceChildren();
    const message = document.createElement('p');
    message.style.cssText = 'margin:20vh 24px;text-align:center;color:white;line-height:1.8';
    message.textContent = error || '현재 이 명함을 볼 수 없습니다. 주소를 확인하거나 담당자에게 문의해 주세요.';
    document.body.append(message);
  }
  function image(media, url) {
    media.replaceChildren();
    const img = document.createElement('img');
    img.src = url; img.alt = ''; img.style.cssText = 'width:100%;height:100%;object-fit:cover';
    media.append(img);
  }
  async function start(init, config) {
    try {
      card = await rpc(window.ZNUS_PREVIEW ? 'getAdminPreviewCard' : 'getPublicCard', window.ZNUS_TOKEN);
      if (!card) return failure();
      config.companyUrl = card.website; config.address = card.address;
      document.title = card.name + ' · ' + card.companyName;
      text('.profile-name h1, #intro-person strong', card.name);
      text('.profile-name .en, #intro-person span', card.nameEn);
      text('.role-text .eyebrow', card.department);
      const title = document.querySelector('.role-text h2');
      title.dataset.ko = card.position; title.dataset.en = card.positionEn; title.textContent = card.position;
      document.querySelectorAll('.role-list li').forEach((el, i) => {
        el.dataset.ko = card.roles[i].ko; el.dataset.en = card.roles[i].en; el.textContent = card.roles[i].ko;
      });
      const phone = document.querySelector('.phone-number');
      phone.textContent = card.phone; phone.href = 'tel:' + card.phone.replace(/[^+\d]/g, '');
      const contact = document.querySelectorAll('.contact-details .contact-link');
      contact[0].textContent = contact[0].dataset.copy = card.email;
      contact[1].textContent = 'FAX  ' + card.companyFax; contact[1].dataset.copy = card.companyFax;
      contact[2].textContent = 'TEL  ' + card.companyPhone; contact[2].href = 'tel:' + card.companyPhone.replace(/[^+\d]/g, '');
      text('.address', card.address);
      document.querySelectorAll('.slogan span').forEach((el, i) => { el.textContent = card.slogans[i]; });
      document.querySelectorAll('.company-logo').forEach(el => { el.src = card.logoUrl; el.alt = card.companyName; });
      document.querySelector('#home-button').setAttribute('aria-label', card.companyName + ' 홈페이지');
      image(document.querySelector('.profile-card .card-media'), card.profileImageUrl);
      document.querySelectorAll('[data-asset]').forEach(el => {
        if (card.assetBase && !el.matches('.company-logo, [download]')) el.setAttribute(el.dataset.assetAttribute, card.assetBase + '/' + el.dataset.asset);
      });
      if (card.assetBase) document.querySelectorAll('.universe-background, .intro-universe').forEach(el => {
        el.style.backgroundImage = 'url(' + JSON.stringify(card.assetBase + '/universe.jpg') + ')';
      });
      for (const section of card.sections) {
        const media = document.querySelector('.' + section.type + '-card .card-media');
        if (section.kind === 'IMAGE') image(media, section.imageUrl);
        if (section.kind === 'VIDEO') {
          const video = media.querySelector('video');
          video.querySelectorAll('source').forEach(el => el.remove());
          const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            rpc(window.ZNUS_PREVIEW ? 'getAdminPreviewMedia' : 'getPublicMedia', card.slug, section.type).then(result => {
              if (!result) return;
              const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
              const url = URL.createObjectURL(new Blob([bytes], {type: result.mime})); objects.push(url);
              video.src = url; video.muted = true; video.play().catch(() => {});
            }).catch(() => { video.setAttribute('aria-label', '배경 영상을 불러오지 못했습니다.'); });
          });
          observer.observe(media);
        }
      }
      document.querySelector('[download]').addEventListener('click', async event => {
        event.preventDefault();
        const button = event.currentTarget;
        if (button.dataset.busy) return;
        button.dataset.busy = 'true';
        try { await download(); } catch (error) { alert('명함 이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
        finally { delete button.dataset.busy; }
      });
      document.body.style.visibility = 'visible';
      init();
      if (!card.publicUrl) {
        text('#qr-code', '공개 주소 연결 후 QR이 표시됩니다.');
        document.querySelector('#share-button').disabled = true;
      }
    } catch (error) { failure('명함을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  }
  async function download() {
    await document.fonts.ready;
    const canvas = document.createElement('canvas'); canvas.width = 626; canvas.height = 1110;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 626, 1110); gradient.addColorStop(0, '#060D15'); gradient.addColorStop(1, '#002041');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 626, 1110);
    const line = (value, x, y, size, color = '#fff', weight = 400, align = 'left', max = 540) => {
      ctx.fillStyle = color; ctx.textAlign = align; ctx.font = weight + ' ' + size + 'px Paperozi, sans-serif';
      while (ctx.measureText(value).width > max && size > 12) ctx.font = weight + ' ' + (--size) + 'px Paperozi, sans-serif';
      ctx.fillText(value, x, y);
    };
    line(card.name, 38, 120, 86, '#fff', 500, 'left', 475);
    line(card.nameEn, 38, 174, 42, '#91a0b3');
    line(card.position, 38, 239, 50, '#c1c2c4');
    const digits = card.phone.replace(/\D/g, '');
    line(digits.slice(0, -8), 582, 360, 92, '#91a0b3', 300, 'right');
    line(digits.slice(-8, -4), 582, 525, 188, '#fff', 300, 'right');
    line(digits.slice(-4), 582, 692, 188, '#fff', 300, 'right');
    const at = card.email.lastIndexOf('@');
    line(card.email.slice(0, at), 582, 820, 75, '#fff', 600, 'right');
    line(card.email.slice(at), 582, 870, 38, '#91a0b3', 400, 'right');
    line('TEL  ' + card.companyPhone, 43, 972, 26, '#91a0b3');
    line('FAX  ' + card.companyFax, 43, 1019, 26, '#91a0b3');
    line(card.address, 43, 1066, 26, '#91a0b3');
    if (window.ZNUS_DEMO) {
      const img = new Image(); img.src = '/assets/logo_s_aw.svg'; await img.decode(); ctx.drawImage(img, 540, 43, 40, 40);
    }
    if (card.logoUrl && !window.ZNUS_DEMO) {
      const logo = await rpc(window.ZNUS_PREVIEW ? 'getAdminPreviewMedia' : 'getPublicMedia', card.slug, 'logo');
      if (logo) {
        const img = new Image(); img.src = 'data:' + logo.mime + ';base64,' + logo.base64; await img.decode();
        const scale = Math.min(40 / img.width, 40 / img.height); ctx.drawImage(img, 540, 43, img.width * scale, img.height * scale);
      }
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('PNG 변환 실패');
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = card.name + '-명함.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  window.addEventListener('pagehide', () => objects.forEach(url => URL.revokeObjectURL(url)));
  return {start, url: () => card?.publicUrl || '', download};
})();
