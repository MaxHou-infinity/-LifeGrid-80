/* Share PNG reads only a confirmed snapshot. Quote rotation is separate from all report/draft keys. */
(function (root, factory) {
    const api=factory(root);
    if(typeof module==='object'&&module.exports)module.exports=api;
    if(root)root.LifeExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
    'use strict';
    const SHARE_URL='https://maxhou.cn/static/life-calculator/index.html';
    const QUOTE_KEY='lifeCalculator_png_quote_index';
    const QUOTES=Object.freeze([
        '想散步的时候，给自己留一个下午。',
        '那本翻到一半的书，还可以接着读。',
        '有空时，约那个很久没见的人吃顿饭。',
        '周末可以没有闹钟。',
        '把想做的小事，放进下次空闲里。',
        '不赶路的傍晚，可以走慢一点。',
        '花一点时间，学会做一道喜欢的菜。',
        '想去的地方，可以先从附近开始。',
        '记得给一场长谈留出时间。',
        '让日历里有一格，只写自己的名字。',
        '好天气的时候，出门看看。',
        '等有空再做的事，先选一件。',
        '给今天的自己，留一段不用解释的时间。',
        '有些下午，适合安静地待着。',
        '找个空闲，把喜欢的歌从头听完。',
        '想学的那件事，可以慢慢来。',
        '下次见面，留够好好说话的时间。',
        '去做那件一直惦记的小事。',
        '给喜欢的事，多留一会儿。',
        '今天的空闲，想怎样度过都可以。'
    ]);
    let memoryIndex=null;
    const model=()=>root.LifeModel||(typeof require==='function'?require('./utils.js'):null);
    const years=hours=>String(Math.round(hours/model().HOURS_PER_YEAR*1000)/1000);
    function content(snapshot,quoteIndex=0){
        if(!snapshot||snapshot.kind!=='confirmed')throw Error('Only confirmed snapshots can be exported');
        const M=model(),report=M.reportLines(snapshot),summary=report.summary,b=summary.budget;
        if(!b||summary.blockers.length)throw Error('Confirmed report is not calculable');
        const heading=snapshot.schemaVersion===2?'原版 V2 · '+M.formatYears(b.B)+'—'+M.formatYears(b.L)+'岁（原口径）':M.formatYears(b.S)+'—'+M.formatYears(b.L)+'岁 · '+M.formatYears(b.D)+'年阶段预算';
        const balance=(summary.E>0?'超出阶段预算约 ':'尚未分配 ')+years(summary.E>0?summary.E:summary.U)+' 年';
        const details=summary.items.map(i=>({id:i.id,color:i.color||M.COLORS[0],excluded:i.status==='excluded',text:(i.name||'未命名活动')+' · '+(i.status==='excluded'?'用户明确排除，不计入统计':'耗费约 '+years(i.hours)+' 年')}));
        const warnings=[];
        for(const w of summary.warnings){
            if(w.code==='over-allocation')warnings.push('超出阶段预算约 '+years(summary.E)+' 年。');
            else if(w.code==='over-horizon')summary.items.filter(i=>i.status==='over-horizon').forEach(i=>warnings.push((i.name||'未命名活动')+'保留 '+i.durationYears+' 年，超出当前阶段，待修正。'));
            else if(w.code==='excluded')warnings.push('已明确排除 '+summary.items.filter(i=>i.status==='excluded').length+' 项；余额不含这些活动。');
            else if(w.code==='damage-excluded')warnings.push('已明确排除无法解析的旧数据，统计范围不完整。');
            else if(w.code==='duplicate-name')warnings.push('同名活动分别保留，未合并。');
            else warnings.push(w.message);
        }
        if(snapshot.schemaVersion===2)warnings.push('沿用原版 V2 预算口径，当前年龄 '+M.formatYears(b.A)+' 岁。');
        const scope='统计范围：'+summary.counted+' 项计入，'+summary.items.filter(i=>i.status==='excluded').length+' 项由用户确认排除。';
        const note='图中颜色表示等效时间，不是实际日程。';
        const quote=QUOTES[Number.isInteger(quoteIndex)&&quoteIndex>=0&&quoteIndex<20?quoteIndex:0];
        return {heading,balance,quote,details,warnings,scope,note,summary,lines:[heading,balance,quote,...details.map(i=>i.text),...warnings,scope,note]};
    }
    function peekQuoteIndex(storage){
        if(memoryIndex!==null)return memoryIndex;
        try{const raw=storage&&storage.getItem(QUOTE_KEY);if(/^(?:[0-9]|1[0-9])$/.test(raw))return Number(raw);}catch(_error){}
        return 0;
    }
    function advanceQuoteIndex(storage,index){
        memoryIndex=(index+1)%20;
        // Failed read/write/readback must never affect report, draft, raw-backup, or download success.
        try{return storage?model().writeVerify(storage,QUOTE_KEY,String(memoryIndex)):{ok:false};}catch(_error){return {ok:false};}
    }
    function wrapText(ctx,text,width){
        const lines=[];let line='';
        for(const char of String(text)){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
        lines.push(line);return lines;
    }
    function qrMatrix(){
        if(typeof root.qrcode!=='function')throw Error('Local QR library unavailable');
        const qr=root.qrcode(0,'M');qr.addData(SHARE_URL,'Byte');qr.make();return qr;
    }
    function buildExportCanvas(snapshot,options={}){
        const M=model(),G=root.LifeGrid,share=content(snapshot,options.quoteIndex),plan=M.gridPlan(snapshot.settings,snapshot.activities,snapshot.schemaVersion);
        if(!plan.ok)throw Error('Confirmed map is not calculable');
        const qr=qrMatrix(),moduleSize=6,quiet=4,qrSize=(qr.getModuleCount()+quiet*2)*moduleSize;
        const canvas=root.document.createElement('canvas'),ctx=canvas.getContext('2d');
        const width=1200,pad=60,gridTop=330,rowStride=14,weekStride=19,cellW=17,cellH=10;
        ctx.font='22px system-ui,sans-serif';
        const detailRows=share.details.map(item=>({...item,lines:wrapText(ctx,item.text,width-pad*2-30)}));
        const warningRows=share.warnings.flatMap(text=>wrapText(ctx,text,width-pad*2));
        const detailsTop=gridTop+plan.rowCount*rowStride+54;
        const detailsHeight=detailRows.reduce((n,item)=>n+item.lines.length*34+14,0);
        const footerTop=detailsTop+detailsHeight+warningRows.length*32+102;
        canvas.width=width;canvas.height=footerTop+Math.max(qrSize+76,300);
        ctx.fillStyle='#f5f7f9';ctx.fillRect(0,0,width,canvas.height);
        ctx.strokeStyle='#e5e9ed';ctx.lineWidth=1;
        for(let x=0;x<width;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
        for(let y=0;y<canvas.height;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
        ctx.fillStyle='#16859a';ctx.font='bold 16px monospace';ctx.fillText('MaxHou / YOUR TIME MAP',pad,50);
        ctx.fillStyle='#102033';ctx.font='bold 32px "Noto Serif SC",serif';ctx.fillText(share.heading,pad,107);
        ctx.fillStyle=share.summary.E>0?'#b86728':'#16859a';ctx.font='bold 52px "Noto Serif SC",serif';ctx.fillText(share.balance,pad,181);
        ctx.fillStyle='#20364b';ctx.font='26px "Noto Serif SC",serif';ctx.fillText(share.quote,pad,239);
        ctx.font='18px system-ui,sans-serif';
        (snapshot.schemaVersion===2?[[G.STATE_COLOR.past,'已过去'],[G.STATE_COLOR['future-excluded'],'尚未纳入规划'],[G.STATE_COLOR.unallocated,'尚未分配']]:[[G.STATE_COLOR.outside,'不纳入本次规划'],[G.STATE_COLOR.unallocated,'尚未分配']]).forEach(([color,label],i)=>{
            ctx.fillStyle=color;ctx.fillRect(pad+i*290,278,16,16);ctx.fillStyle='#536376';ctx.fillText(label,pad+26+i*290,293);
        });
        const colors=Object.fromEntries(snapshot.activities.map(a=>[a.id,a.color||M.COLORS[0]]));
        plan.cells.forEach(cell=>cell.segments.forEach(seg=>{
            ctx.fillStyle=seg.kind==='activity'?colors[seg.activityId]:G.STATE_COLOR[seg.kind];
            ctx.fillRect(120+cell.week*weekStride+seg.startFraction*cellW,gridTop+cell.year*rowStride,(seg.endFraction-seg.startFraction)*cellW,cellH);
        }));
        ctx.fillStyle='#536376';ctx.font='13px monospace';
        for(let age=0;age<plan.rowCount;age++)if(age%10===0||age===Math.floor(plan.budget.B))ctx.fillText(age+'岁',pad,gridTop+age*rowStride+10);
        let y=detailsTop;ctx.font='22px system-ui,sans-serif';
        const rowBounds=[];
        for(const item of detailRows){
            const top=y;ctx.fillStyle=item.excluded?'#536376':item.color;ctx.fillRect(pad,y-15,14,14);
            ctx.fillStyle='#20364b';for(const line of item.lines){ctx.fillText(line,pad+30,y);y+=34;}
            rowBounds.push({id:item.id,top,bottom:y,text:item.text});y+=14;
        }
        ctx.fillStyle='#96511f';for(const line of warningRows){ctx.fillText(line,pad,y);y+=32;}
        ctx.fillStyle='#536376';ctx.font='18px system-ui,sans-serif';ctx.fillText(share.scope,pad,y+14);ctx.fillText(share.note,pad,y+48);
        ctx.strokeStyle='#cbd3dc';ctx.beginPath();ctx.moveTo(pad,footerTop);ctx.lineTo(width-pad,footerTop);ctx.stroke();
        ctx.fillStyle='#102033';ctx.font='bold 30px "Noto Serif SC",serif';ctx.fillText('MaxHou',pad,footerTop+192);
        ctx.font='20px system-ui,sans-serif';ctx.fillText('扫码，安排自己的时间',pad,footerTop+230);
        const qrX=width-pad-qrSize,qrY=footerTop+25;
        ctx.fillStyle='#fff';ctx.fillRect(qrX,qrY,qrSize,qrSize);ctx.fillStyle='#102033';
        for(let row=0;row<qr.getModuleCount();row++)for(let col=0;col<qr.getModuleCount();col++)if(qr.isDark(row,col))ctx.fillRect(qrX+(col+quiet)*moduleSize,qrY+(row+quiet)*moduleSize,moduleSize,moduleSize);
        return {canvas,lines:share.lines,summary:share.summary,plan,quoteIndex:options.quoteIndex||0,quote:share.quote,rowBounds,
            qr:{url:SHARE_URL,x:qrX,y:qrY,size:qrSize,moduleSize,quietModules:quiet},snapshotSignature:JSON.stringify(snapshot)};
    }
    const api={content,buildExportCanvas,peekQuoteIndex,advanceQuoteIndex,QUOTES,QUOTE_KEY,SHARE_URL,lastExport:null};
    api.download=function(snapshot){
        let storage;try{storage=root.localStorage;}catch(_error){}
        const quoteIndex=peekQuoteIndex(storage),built=buildExportCanvas(snapshot,{quoteIndex});
        const link=root.document.createElement('a');link.href=built.canvas.toDataURL('image/png');link.download='life-calculator-confirmed.png';link.click();
        api.lastExport={quoteIndex,quote:built.quote,snapshotSignature:built.snapshotSignature};advanceQuoteIndex(storage,quoteIndex);return built;
    };
    return api;
});
