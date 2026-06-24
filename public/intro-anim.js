(function(){
  var GAP=225;

  function animS1(cb){
    var words=document.querySelectorAll('#siS1 .si-w');
    words.forEach(function(w){
      var d=parseInt(w.getAttribute('data-d')||'0');
      setTimeout(function(){
        w.style.transition='transform .72s cubic-bezier(.22,1.15,.36,1),opacity .45s ease';
        w.style.transform='translateY(0)';
        w.style.opacity='1';
      },d+200);
    });
    setTimeout(function(){
      var fl=document.getElementById('siFlash');
      fl.style.transition='opacity .07s ease';
      fl.style.opacity='1';
      setTimeout(function(){
        fl.style.transition='opacity .45s ease';
        fl.style.opacity='0';
      },70);
      var g=document.getElementById('siGold');
      g.style.transition='opacity .12s ease,filter .65s ease';
      g.style.opacity='1';
      setTimeout(function(){g.style.filter='brightness(1)';},100);
      setTimeout(cb,3000);
    },675+200+750);
  }

  function transicion(cb){
    var s1=document.getElementById('siS1');
    s1.style.transition='opacity .9s ease';
    s1.style.opacity='0';
    setTimeout(function(){s1.style.pointerEvents='none';},900);
    var s2=document.getElementById('siS2');
    s2.style.transition='opacity .9s ease';
    s2.style.opacity='1';
    s2.style.pointerEvents='all';
    setTimeout(cb,900);
  }

  function animS2(){
    var words=document.querySelectorAll('#siTxt .si-word');
    var STAGGER=85;
    words.forEach(function(w,i){
      setTimeout(function(){
        w.classList.add('in');
      },i*STAGGER);
    });

    var lastWordTime=words.length*STAGGER;

    setTimeout(function(){
      var d=document.getElementById('siD1');
      d.classList.add('in');
    },lastWordTime+200);
    setTimeout(function(){
      var d=document.getElementById('siD2');
      d.classList.add('in');
    },lastWordTime+500);
    setTimeout(function(){
      var d=document.getElementById('siD3');
      d.classList.add('in');
    },lastWordTime+800);

    setTimeout(function(){
      var c=document.getElementById('siCur');
      c.style.opacity='1';
      c.style.animation='siBlink .7s step-end infinite';
    },lastWordTime+1000);

    setTimeout(function(){
      var c=document.getElementById('siCur');
      c.style.animation='none';
      c.style.opacity='0';
    },lastWordTime+1800);

    setTimeout(function(){
      var h=document.getElementById('siHlt');
      h.style.transition='opacity .3s ease';
      h.style.opacity='1';
      var hlWords=h.querySelectorAll('.si-word');
      hlWords.forEach(function(w,i){
        setTimeout(function(){ w.classList.add('in'); },i*STAGGER);
      });
    },lastWordTime+2000);

    setTimeout(function(){
      var hbg=document.getElementById('siHbg');
      hbg.style.transition='transform .6s cubic-bezier(.4,0,.2,1)';
      hbg.style.transform='scaleX(1)';
    },lastWordTime+2400);

    setTimeout(function(){
      var m=document.getElementById('siMeta');
      m.style.transition='opacity .6s ease';
      m.style.opacity='1';
    },lastWordTime+3000);

    setTimeout(function(){
      var b=document.getElementById('siBtnW');
      b.style.transition='opacity .6s ease,transform .6s ease';
      b.style.opacity='1';
      b.style.transform='none';
    },lastWordTime+3400);
  }

  function run(){
    animS1(function(){
      transicion(function(){
        animS2();
      });
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',run);
  } else {
    setTimeout(run,100);
  }
})();
