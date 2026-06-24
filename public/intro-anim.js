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

  function typewrite(el,text,speed,cb){
    var i=0;
    function tick(){
      if(i<=text.length){
        el.textContent=text.substring(0,i);
        i++;
        setTimeout(tick,speed);
      } else {
        var cur=document.getElementById('siHandCur');
        if(cur) cur.style.display='none';
        if(cb) cb();
      }
    }
    tick();
  }

  function animMid(cb){
    var mid=document.getElementById('siMid');
    fadeIn(mid);

    var phrases=document.querySelectorAll('#siConv > .si-phrase');
    var hand=document.getElementById('siHand');
    var delay=600;

    function showPhrase(i){
      if(i>=phrases.length){
        // Show handwritten text
        setTimeout(function(){
          hand.style.transition='opacity .5s ease';
          hand.style.opacity='1';
          var txt=document.getElementById('siHandTxt');
          typewrite(txt,'Vamos a despejar esto rápido.',55,function(){
            setTimeout(function(){
              document.getElementById('siHandSub').style.opacity='1';
            },400);
            setTimeout(function(){
              fadeOut(mid,cb);
            },4000);
          });
        },300);
        return;
      }

      setTimeout(function(){
        phrases[i].style.transition='opacity .7s ease,filter .7s ease';
        phrases[i].style.opacity='1';
        phrases[i].style.filter='blur(0)';
      },delay);

      var readTime=phrases[i].textContent.length*80+1400;
      setTimeout(function(){
        phrases[i].style.transition='opacity .6s ease';
        phrases[i].style.opacity='0';
        setTimeout(function(){ showPhrase(i+1); },700);
      },delay+readTime);
    }

    showPhrase(0);
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
          var s2=document.getElementById('siS2');
          fadeIn(s2);
          setTimeout(animS2,600);
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
