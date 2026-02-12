 
custom.item.map(x => ({ id: x.id, name: x.name, unit: x.unit, price: x.price, kind: 'item' })));

    ensureOrderList(dinos.filter(d => !hidden.dino.has(d.id)), 'dino');
    ensureOrderList(items.filter(i => !hidden.item.has(i.id)), 'item');

    setTab('dino');
  }

  init().catch((err) => {
    console.error(err);
    openToast('初期化エラーで停止しました（管理＞Version/Console確認）');

    // ここで落ちても「何も表示されない」を回避する
    try { setTab('dino'); } catch {}
  });
})();