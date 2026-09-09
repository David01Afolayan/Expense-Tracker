(function(){
  'use strict';

  // LocalStorage key
  const STORAGE_KEY = 'expenseTrackerTransactionsV1';

  // DOM refs
  const refs = {
    form: document.getElementById('transactionForm'),
    txId: document.getElementById('txId'),
    description: document.getElementById('description'),
    date: document.getElementById('date'),
    category: document.getElementById('category'),
    amount: document.getElementById('amount'),
    addBtn: document.getElementById('addBtn'),
    clearBtn: document.getElementById('clearBtn'),
    transactionList: document.getElementById('transactionList'),
    balance: document.getElementById('balance'),
    income: document.getElementById('income'),
    expense: document.getElementById('expense'),
    search: document.getElementById('search'),
    filterCategory: document.getElementById('filterCategory'),
    fromDate: document.getElementById('fromDate'),
    toDate: document.getElementById('toDate'),
    sortBy: document.getElementById('sortBy'),
    applyFilters: document.getElementById('applyFilters'),
    resetFilters: document.getElementById('resetFilters'),
    undoBtn: document.getElementById('undoBtn'),
    exportJson: document.getElementById('exportJson'),
    exportCsv: document.getElementById('exportCsv'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    toast: document.getElementById('toast'),
    incomeExpenseChart: document.getElementById('incomeExpenseChart'),
    categoryChart: document.getElementById('categoryChart')
  };

  let transactions = [];
  let lastDeleted = null;
  let charts = {incExp:null, cat:null};

  // Utilities
  const uid = () => '_' + Math.random().toString(36).slice(2,9);
  const money = v => Number(v).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
  const showToast = (msg, timeout=2500)=>{
    if(!refs.toast) return; refs.toast.hidden=false; refs.toast.textContent=msg;
    clearTimeout(refs._toastTimer);
    refs._toastTimer = setTimeout(()=>{refs.toast.hidden=true}, timeout);
  }

  // Persistence
  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      transactions = raw ? JSON.parse(raw) : [];
    }catch(e){transactions=[]}
  }
  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  // CRUD
  function addTransaction(tx){
    tx.id = tx.id || uid();
    transactions.push(tx);
    save();
    render();
    showToast('Transaction saved');
  }
  function updateTransaction(id, patch){
    const i = transactions.findIndex(t=>t.id===id); if(i<0) return;
    transactions[i] = {...transactions[i], ...patch};
    save(); render(); showToast('Transaction updated');
  }
  function deleteTransaction(id){
    const i = transactions.findIndex(t=>t.id===id); if(i<0) return;
    lastDeleted = transactions.splice(i,1)[0];
    save(); render(); refs.undoBtn.disabled=false; showToast('Transaction deleted');
  }
  function undoDelete(){
    if(!lastDeleted) return; transactions.push(lastDeleted); lastDeleted=null; save(); render(); refs.undoBtn.disabled=true; showToast('Undo successful');
  }

  // Rendering
  function render(){
    renderSummary();
    renderList();
    renderCharts();
  }
  function renderSummary(){
    const incomeTotal = transactions.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    const expenseTotal = transactions.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0);
    const balance = incomeTotal + expenseTotal;
    refs.income.textContent = '₦' + money(incomeTotal);
    refs.expense.textContent = '₦' + money(Math.abs(expenseTotal));
    refs.balance.textContent = '₦' + money(balance);
  }

  function matchesFilters(tx){
    const q = (refs.search.value||'').toLowerCase().trim();
    if(q){
      const hay = (tx.description + ' ' + tx.category).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    const fc = refs.filterCategory.value;
    if(fc && tx.category !== fc) return false;
    const from = refs.fromDate.value ? new Date(refs.fromDate.value) : null;
    const to = refs.toDate.value ? new Date(refs.toDate.value) : null;
    const d = new Date(tx.date);
    if(from && d < from) return false;
    if(to && d > new Date(to.getFullYear(), to.getMonth(), to.getDate(),23,59,59)) return false;
    return true;
  }

  function renderList(){
    // apply filters and sort
    const list = transactions.slice().filter(matchesFilters);
    const sort = refs.sortBy.value;
    list.sort((a,b)=>{
      if(sort === 'date_desc') return new Date(b.date) - new Date(a.date);
      if(sort === 'date_asc') return new Date(a.date) - new Date(b.date);
      if(sort === 'amount_desc') return b.amount - a.amount;
      if(sort === 'amount_asc') return a.amount - b.amount;
      return 0;
    });

    refs.transactionList.innerHTML = '';
    if(list.length===0){
      refs.transactionList.innerHTML = '<tr><td colspan="5" class="small">No transactions</td></tr>';
      return;
    }

    const frag = document.createDocumentFragment();
    list.forEach(tx=>{
      const tr = document.createElement('tr');
      const dateTd = document.createElement('td'); dateTd.textContent = new Date(tx.date).toLocaleDateString(); dateTd.setAttribute('data-label','Date');
      const descTd = document.createElement('td'); descTd.textContent = tx.description; descTd.setAttribute('data-label','Description');
      const catTd = document.createElement('td'); catTd.textContent = tx.category; catTd.setAttribute('data-label','Category');
      const amtTd = document.createElement('td'); amtTd.className='numeric'; amtTd.textContent = money(tx.amount); amtTd.setAttribute('data-label','Amount');
      const actTd = document.createElement('td'); actTd.className='actions'; actTd.setAttribute('data-label','Actions');

      const editBtn = document.createElement('button'); editBtn.textContent='Edit'; editBtn.addEventListener('click', ()=>openEdit(tx.id));
      const delBtn = document.createElement('button'); delBtn.textContent='Delete'; delBtn.className='delete'; delBtn.addEventListener('click', ()=>{ if(confirm('Delete transaction?')) deleteTransaction(tx.id); });
      actTd.appendChild(editBtn); actTd.appendChild(delBtn);

      tr.appendChild(dateTd); tr.appendChild(descTd); tr.appendChild(catTd); tr.appendChild(amtTd); tr.appendChild(actTd);
      frag.appendChild(tr);
    });
    refs.transactionList.appendChild(frag);
  }

  // Chart availability flag (defensive)
  const CHART_AVAILABLE = typeof Chart !== 'undefined';

  // Charts
  function renderCharts(){
    // If Chart.js isn't available, avoid throwing — notify the user once.
    if(!CHART_AVAILABLE){
      // only show the toast if chart elements exist in the DOM
      if(refs.incomeExpenseChart || refs.categoryChart) showToast('Chart.js not loaded — charts disabled', 5000);
      return;
    }

    if(!refs.incomeExpenseChart || !refs.categoryChart) return;

    try{
      // prepare monthly income/expense for last 6 months
      const now = new Date();
      const months = [];
      for(let i=5;i>=0;i--){
        const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
        months.push({label: d.toLocaleString(undefined,{month:'short', year:'numeric'}), key: d.getFullYear()+'-'+(d.getMonth()+1), inc:0, exp:0});
      }
      transactions.forEach(t=>{
        const d = new Date(t.date);
        const key = d.getFullYear()+'-'+(d.getMonth()+1);
        const m = months.find(m=>m.key===key);
        if(m){ if(t.amount>0) m.inc+=t.amount; else m.exp+=Math.abs(t.amount); }
      });

      const labels = months.map(m=>m.label);
      const incData = months.map(m=>m.inc);
      const expData = months.map(m=>m.exp);

      if(charts.incExp) charts.incExp.destroy();
      charts.incExp = new Chart(refs.incomeExpenseChart.getContext('2d'),{
        type:'bar',
        data:{labels, datasets:[{label:'Income', data:incData, backgroundColor:'rgba(34,197,94,0.7)'},{label:'Expense', data:expData, backgroundColor:'rgba(239,68,68,0.7)'}]},
        options:{responsive:true, maintainAspectRatio:false}
      });

      // category breakdown
      const catMap = {};
      transactions.forEach(t=>{ catMap[t.category] = (catMap[t.category]||0) + Math.abs(t.amount); });
      const catLabels = Object.keys(catMap);
      const catValues = catLabels.map(k=>catMap[k]);
      if(charts.cat) charts.cat.destroy();
      charts.cat = new Chart(refs.categoryChart.getContext('2d'),{
        type:'pie', data:{labels:catLabels, datasets:[{data:catValues, backgroundColor:catLabels.map((_,i)=>`hsl(${i*50 % 360} 70% 55%)`)}]}, options:{responsive:true, maintainAspectRatio:false}
      });
    }catch(err){
      console.error('Chart rendering error', err);
      showToast('Unable to render charts (see console)');
    }
  }

  // Form helpers
  function openEdit(id){
    const tx = transactions.find(t=>t.id===id); if(!tx) return;
    refs.txId.value = tx.id; refs.description.value = tx.description; refs.date.value = tx.date; refs.category.value = tx.category; refs.amount.value = tx.amount;
    refs.addBtn.textContent = 'Update Transaction';
  }
  function clearForm(){ refs.txId.value=''; refs.form.reset(); refs.addBtn.textContent='Save Transaction'; }

  // Export / Import
  function exportJSON(){
    const data = JSON.stringify(transactions, null, 2);
    downloadFile('transactions.json', data, 'application/json');
  }
  function exportCSV(){
    const rows = [['id','date','description','category','amount']];
    transactions.forEach(t=> rows.push([t.id, t.date, `"${t.description.replace(/"/g,'""')}"`, t.category, t.amount]));
    const csv = rows.map(r=>r.join(',')).join('\n');
    downloadFile('transactions.csv', csv, 'text/csv');
  }
  function downloadFile(name, data, type){
    const blob = new Blob([data], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function importFile(file){
    const reader = new FileReader();
    reader.onload = e=>{
      try{
        const text = e.target.result;
        if(file.type.includes('json') || file.name.endsWith('.json')){
          const arr = JSON.parse(text);
          if(Array.isArray(arr)){
            // Basic shape check
            const cleaned = arr.map(a=>({id:a.id||uid(), date:a.date||new Date().toISOString().slice(0,10), description:a.description||'', category:a.category||'Other', amount: Number(a.amount)||0}));
            transactions = transactions.concat(cleaned); save(); render(); showToast('Imported JSON');
          }
        } else {
          // try csv
          const lines = text.split(/\r?\n/).filter(Boolean);
          const data = lines.slice(1).map(l=>{
            const cols = l.split(',');
            return {id: cols[0]||uid(), date: cols[1]||new Date().toISOString().slice(0,10), description: (cols[2]||'').replace(/^\"|\"$/g,''), category: cols[3]||'Other', amount: Number(cols[4])||0};
          });
          transactions = transactions.concat(data); save(); render(); showToast('Imported CSV');
        }
      }catch(err){ showToast('Import failed'); }
    };
    reader.readAsText(file);
  }

  // Events
  function attach(){
    refs.form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const payload = {description: refs.description.value.trim(), date: refs.date.value, category: refs.category.value || 'Other', amount: Number(refs.amount.value)};
      if(!payload.description || !payload.date || !payload.amount){ showToast('Please complete all fields (use negative amount for expenses)'); return; }
      if(refs.txId.value){ updateTransaction(refs.txId.value, payload); } else { addTransaction(payload); }
      clearForm();
    });
    refs.clearBtn.addEventListener('click', (e)=>{ e.preventDefault(); clearForm(); });
    refs.applyFilters.addEventListener('click', (e)=>{ e.preventDefault(); render(); });
    refs.resetFilters.addEventListener('click', (e)=>{ e.preventDefault(); refs.search.value=''; refs.filterCategory.value=''; refs.fromDate.value=''; refs.toDate.value=''; refs.sortBy.value='date_desc'; render(); });
    refs.undoBtn.addEventListener('click', ()=>{ undoDelete(); });
    refs.exportJson.addEventListener('click', exportJSON);
    refs.exportCsv.addEventListener('click', exportCSV);
    refs.importBtn.addEventListener('click', ()=>refs.importFile.click());
    refs.importFile.addEventListener('change', (ev)=>{ const f=ev.target.files[0]; if(f) importFile(f); ev.target.value=''; });
    refs.search.addEventListener('input', debounce(()=>render(), 300));
    refs.filterCategory.addEventListener('change', ()=>render());
    refs.sortBy.addEventListener('change', ()=>render());
    // keyboard shortcut: n to focus description
    document.addEventListener('keydown', (e)=>{ if(e.key==='n' && !e.metaKey && !e.ctrlKey){ refs.description.focus(); } });
  }

  // small helpers
  function debounce(fn, wait){ let t; return function(...a){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,a), wait); } }

  // init
  function init(){ load(); attach(); render(); refs.undoBtn.disabled = !lastDeleted; }

  // boot
  init();
})();