(() => {
  const markup = `<section class="media-cropper" hidden role="dialog" aria-modal="true" aria-labelledby="mediaCropperTitle"><div class="media-cropper__dialog"><header class="media-cropper__head"><div><h2 id="mediaCropperTitle">모바일 배경 맞춤</h2><p>9:16 화면 안에서 드래그해 중심을 맞춰주세요.</p></div><button class="media-cropper__close" type="button" aria-label="닫기">×</button></header><div class="media-cropper__body"><div class="media-cropper__stage"><div class="media-cropper__guide"></div></div><div class="media-cropper__controls"><span class="media-cropper__kind"></span><label>확대 <input class="media-cropper__zoom" type="range" min="1" max="2" step="0.01" value="1"></label><p class="media-cropper__help">이미지와 영상 모두 가능합니다. 영상은 재인코딩하지 않고 재생 화면의 구도만 저장하므로 화질이 유지됩니다.</p><div class="media-cropper__actions"><button class="media-cropper__cancel" type="button">취소</button><button class="media-cropper__apply primary" type="button">이 구도 사용</button></div></div></div></div></section>`;
  document.body.insertAdjacentHTML('beforeend', markup);
  const modal = document.querySelector('.media-cropper');
  const stage = modal.querySelector('.media-cropper__stage');
  const zoom = modal.querySelector('.media-cropper__zoom');
  const kind = modal.querySelector('.media-cropper__kind');
  let active = null, media = null, objectUrl = '', resolveOpen = null, dragging = null;
  const clamp = value => Math.max(0, Math.min(100, value));
  function paint(){ if (!media || !active) return; media.style.objectPosition = `${active.x}% ${active.y}%`; media.style.transform = `scale(${active.scale})`; }
  function finish(value){ if (!resolveOpen) return; const done=resolveOpen; resolveOpen=null; modal.hidden=true; if(media){media.pause?.();media.remove();media=null;} if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';done(value); }
  function open(file, initial={}){
    if (!file || (!file.type.startsWith('image/') && file.type !== 'video/mp4')) return Promise.reject(new Error('JPG, PNG, WEBP 이미지 또는 MP4 영상을 선택해 주세요.'));
    active={x:Number(initial.x ?? 50),y:Number(initial.y ?? 50),scale:Number(initial.scale ?? 1)}; zoom.value=String(active.scale); objectUrl=URL.createObjectURL(file);
    media=document.createElement(file.type === 'video/mp4' ? 'video' : 'img'); media.className='media-cropper__media'; media.src=objectUrl; if(media.tagName==='VIDEO'){media.muted=true;media.loop=true;media.playsInline=true;media.autoplay=true;}
    stage.insertBefore(media, stage.firstChild); kind.textContent=media.tagName==='VIDEO'?'MP4 영상 · 9:16 표시 영역':'이미지 · 9:16 표시 영역'; paint(); modal.hidden=false; media.play?.().catch(()=>{});
    return new Promise(resolve=>{resolveOpen=resolve;});
  }
  zoom.addEventListener('input',()=>{active.scale=Number(zoom.value);paint();});
  stage.addEventListener('pointerdown',event=>{if(!active)return;dragging={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:active.x,y:active.y};stage.setPointerCapture(event.pointerId);});
  stage.addEventListener('pointermove',event=>{if(!dragging||dragging.id!==event.pointerId)return;const rect=stage.getBoundingClientRect();active.x=clamp(dragging.x-(event.clientX-dragging.startX)/rect.width*100/active.scale);active.y=clamp(dragging.y-(event.clientY-dragging.startY)/rect.height*100/active.scale);paint();});
  stage.addEventListener('pointerup',()=>{dragging=null;}); stage.addEventListener('pointercancel',()=>{dragging=null;});
  modal.querySelector('.media-cropper__apply').addEventListener('click',()=>finish({...active})); modal.querySelector('.media-cropper__cancel').addEventListener('click',()=>finish(null)); modal.querySelector('.media-cropper__close').addEventListener('click',()=>finish(null));
  modal.addEventListener('click',event=>{if(event.target===modal)finish(null);}); document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)finish(null);});
  window.ZnusMediaCropper={open};
})();
