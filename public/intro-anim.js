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

  function wrapWords(p){
    var html=p.innerHTML;
    var strong=p.querySelector('strong');
    if(strong){
      var sWords=strong.textContent.trim().split(/\s+/);
      var sHtml=sWords.map(function(w){return '<span class="kw">'+w+'</span>';}).join(' ');
      strong.innerHTML=sHtml;
      var outside=p.childNodes;
      var frag=document.createDocumentFragment();
      outside.forEach(function(node){
        if(node===strong){
          frag.appendChild(node);
        } else if(node.nodeType===3){
          var words=node.textContent.split(/(\s+)/);
          words.forEach(function(w){
            if(/^\s+$/.test(w)){
              frag.appendChild(document.createTextNode(w));
            } else if(w){
              var span=document.createElement('span');
              span.className='kw';
              span.textContent=w;
              frag.appendChild(span);
            }
          });
        } else {
          frag.appendChild(node);
        }
      });
      p.innerHTML='';
      p.appendChild(frag);
    } else {
      var words=p.textContent.trim().split(/\s+/);
      p.innerHTML=words.map(function(w){return '<span class="kw">'+w+'</span>';}).join(' ');
    }
  }

  function karaokePhrase(el,wpm,cb){
    var words=el.querySelectorAll('.kw');
    var msPerWord=60000/wpm;
    var i=0;
    function tick(){
      if(i>0){
        words[i-1].classList.remove('lit');
        words[i-1].classList.add('past');
      }
      if(i>=words.length){
        if(cb) cb();
        return;
      }
      words[i].classList.add('lit');
      i++;
      setTimeout(tick,msPerWord);
    }
    tick();
  }

  function animMid(cb){
    var mid=document.getElementById('siMid');
    mid.style.transition='opacity .9s ease';
    mid.style.opacity='1';
    mid.style.pointerEvents='all';

    var fades=['mf0','mf1','mf2'];

    fades.forEach(function(id){
      var p=document.getElementById(id).querySelector('p');
      wrapWords(p);
    });

    var i=0;

    function nextFade(){
      if(i>=fades.length){
        showLast();
        return;
      }
      var el=document.getElementById(fades[i]);

      el.style.opacity='1';

      setTimeout(function(){
        karaokePhrase(el,300,function(){
          setTimeout(function(){
            el.style.transition='opacity .7s ease';
            el.style.opacity='0';
            setTimeout(function(){
              i++;
              nextFade();
            },800);
          },600);
        });
      },400);
    }

    function showLast(){
      var stay=document.getElementById('mfLast');
      stay.style.opacity='1';

      var text=stay.querySelector('p').textContent;
      var readTime=Math.max(text.length*75,2000)+1000;

      setTimeout(function(){
        var hand=document.getElementById('siHand');
        hand.style.opacity='1';
        var txt=document.getElementById('siHandTxt');
        typewrite(txt,'Vamos a despejar esto rápido.',60,function(){
          setTimeout(function(){
            document.getElementById('siHandSub').classList.add('in');
          },600);
          setTimeout(function(){
            mid.style.transition='opacity .9s ease';
            mid.style.opacity='0';
            setTimeout(function(){
              mid.style.pointerEvents='none';
              cb();
            },900);
          },3500);
        });
      },readTime);
    }

    setTimeout(nextFade,1000);
  }

  function typewrite(el,text,speed,cb){
    var i=0;
    function tick(){
      if(i<=text.length){
        el.textContent=text.substring(0,i);
        i++;
        setTimeout(tick,speed);
      } else {
        document.getElementById('siHandCur').style.display='none';
        if(cb) cb();
      }
    }
    tick();
  }

  function animS2(){
    var step1=document.getElementById('s2step1');
    step1.style.transition='opacity .7s ease';
    step1.style.opacity='1';
  }

  function run(){
    animS1(function(){
      var s1=document.getElementById('siS1');
      s1.style.transition='opacity .9s ease';
      s1.style.opacity='0';
      setTimeout(function(){s1.style.pointerEvents='none';},900);
      setTimeout(function(){
        animMid(function(){
          var s2=document.getElementById('siS2');
          s2.style.transition='opacity .9s ease';
          s2.style.opacity='1';
          s2.style.pointerEvents='all';
          setTimeout(animS2,1000);
        });
      },900);
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',run);
  } else {
    setTimeout(run,100);
  }
})();
