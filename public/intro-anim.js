(function(){

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

  function fadeOut(el,cb){
    el.style.transition='opacity .9s ease';
    el.style.opacity='0';
    setTimeout(function(){el.style.pointerEvents='none';},900);
    setTimeout(cb,900);
  }

  function fadeIn(el){
    el.style.transition='opacity .9s ease';
    el.style.opacity='1';
    el.style.pointerEvents='all';
  }

  function animPhrases(container,stagger,cb){
    var phrases=container.querySelectorAll('.si-phrase');
    phrases.forEach(function(p,i){
      setTimeout(function(){ p.classList.add('in'); },i*stagger);
    });
    var total=phrases.length*stagger+900;
    setTimeout(cb,total);
  }

  function animMid(cb){
    var mid=document.getElementById('siMid');
    fadeIn(mid);
    setTimeout(function(){
      animPhrases(document.getElementById('siConv'),1400,function(){
        setTimeout(cb,2000);
      });
    },600);
  }

  function animS2(){
    var phrases=document.querySelectorAll('#siTxt .si-phrase');
    var STAGGER=1200;
    phrases.forEach(function(p,i){
      setTimeout(function(){ p.classList.add('in'); },i*STAGGER);
    });

    var afterPhrases=phrases.length*STAGGER;

    setTimeout(function(){
      var b=document.getElementById('siBtnW');
      b.style.transition='opacity .6s ease,transform .6s ease';
      b.style.opacity='1';
      b.style.transform='none';
    },afterPhrases+400);
  }

  function run(){
    animS1(function(){
      fadeOut(document.getElementById('siS1'),function(){
        animMid(function(){
          fadeOut(document.getElementById('siMid'),function(){
            var s2=document.getElementById('siS2');
            fadeIn(s2);
            setTimeout(animS2,600);
          });
        });
      });
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',run);
  } else {
    setTimeout(run,100);
  }
})();
