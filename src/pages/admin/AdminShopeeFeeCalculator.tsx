import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Tag, Truck, CreditCard, Calculator, Info, TrendingDown, DollarSign, Scale, Package, FolderTree, Plus, Trash2, X } from 'lucide-react';
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
import CategorySearch from "@/components/admin/CategorySearch";
import type { CategoryOption } from "@/utils/shopeeCategories";
import { usePlatformFeeConfig, getDefaultFeeConfig } from "@/hooks/usePlatformFeeConfig";
import { DEFAULT_SHOPEE_FEE_CONFIG } from "@/utils/shopeeFeeCalculator";

interface ProductItem {
  id: string;
  price: number;
  quantity: number;
  category: CategoryOption | null;
  fixedFeeRate: number;
}

const AdminShopeeFeeCalculator = () => {
  // Danh sách sản phẩm
  const [products, setProducts] = useState<ProductItem[]>([
    { id: '1', price: 100000, quantity: 1, category: null, fixedFeeRate: 11.29 }
  ]);
  
  // Sản phẩm đang được thêm/sửa
  const [newProduct, setNewProduct] = useState({
    price: 100000,
    quantity: 1,
    category: null as CategoryOption | null,
    fixedFeeRate: 11.29
  });
  
  const [shippingFee, setShippingFee] = useState(0);
  
  // Load fee config from database
  const { data: dbConfig, isLoading: isLoadingConfig } = usePlatformFeeConfig('shopee');
  const defaultConfig = getDefaultFeeConfig('shopee');
  const mergedConfig = { ...DEFAULT_SHOPEE_FEE_CONFIG, ...defaultConfig, ...(dbConfig || {}) };
  
  // Các loại phí sàn Shopee - Load từ database hoặc dùng default
  const [paymentFeeRate, setPaymentFeeRate] = useState(mergedConfig.paymentFeeRate || 4.91); 
  const [voucherXtraRate, setVoucherXtraRate] = useState(mergedConfig.voucherXtraRate || 3); 
  const [infrastructureFee, setInfrastructureFee] = useState(mergedConfig.infrastructureFee || 3000); 
  const [piShipFee, setPiShipFee] = useState(mergedConfig.piShipFee || 1620); 
  
  // Thuế (Theo quy định hộ kinh doanh cá thể trên sàn)
  const [vatRate, setVatRate] = useState(mergedConfig.vatRate || 1); // Thuế GTGT 1%
  const [pitRate, setPitRate] = useState(mergedConfig.pitRate || 0.5); // Thuế TNCN 0.5%

  // Update state when config loads from database
  useEffect(() => {
    if (dbConfig && !isLoadingConfig) {
      if (dbConfig.paymentFeeRate !== undefined) setPaymentFeeRate(dbConfig.paymentFeeRate);
      if (dbConfig.voucherXtraRate !== undefined) setVoucherXtraRate(dbConfig.voucherXtraRate);
      if (dbConfig.infrastructureFee !== undefined) setInfrastructureFee(dbConfig.infrastructureFee);
      if (dbConfig.piShipFee !== undefined) setPiShipFee(dbConfig.piShipFee);
      if (dbConfig.vatRate !== undefined) setVatRate(dbConfig.vatRate);
      if (dbConfig.pitRate !== undefined) setPitRate(dbConfig.pitRate);
    }
  }, [dbConfig, isLoadingConfig]);

  // Update fixedFeeRate when category is selected for new product
  useEffect(() => {
    if (newProduct.category) {
      setNewProduct(prev => ({ ...prev, fixedFeeRate: newProduct.category!.fixedFeeRate }));
    }
  }, [newProduct.category]);

  // Tính toán phí cho từng sản phẩm
  const productFees = useMemo(() => {
    return products.map(product => {
      const productSales = product.price * product.quantity;
      const fixedFee = Math.round(productSales * (product.fixedFeeRate / 100));
      
      // Phí Voucher Xtra (3%) - có giới hạn 20,000đ/sản phẩm
      let vxFee = Math.round(productSales * (voucherXtraRate / 100));
      const vxCap = 20000;
      if (vxFee > vxCap * product.quantity) vxFee = vxCap * product.quantity;
      
      // Thuế
      const vatFee = Math.round(productSales * (vatRate / 100));
      const pitFee = Math.round(productSales * (pitRate / 100));
      
      // Phí cố định + Voucher Xtra + Thuế (chỉ tính cho sản phẩm này)
      const productFees = fixedFee + vxFee + vatFee + pitFee;
      
      return {
        ...product,
        productSales,
        fixedFee,
        voucherXtraFee: vxFee,
        vatFee,
        pitFee,
        productFees,
        netRevenue: productSales - productFees
      };
    });
  }, [products, voucherXtraRate, vatRate, pitRate]);

  // Tính tổng hợp cho toàn bộ đơn hàng
  const orderSummary = useMemo(() => {
    const totalSales = productFees.reduce((sum, p) => sum + p.productSales, 0);
    const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
    const totalOrderValue = totalSales + shippingFee;
    
    // Phí thanh toán tính trên tổng giá trị đơn hàng
    const paymentFee = Math.round(totalOrderValue * (paymentFeeRate / 100));
    
    // Tổng phí cố định từ tất cả sản phẩm
    const totalFixedFee = productFees.reduce((sum, p) => sum + p.fixedFee, 0);
    
    // Tổng Voucher Xtra
    const totalVoucherXtraFee = productFees.reduce((sum, p) => sum + p.voucherXtraFee, 0);
    
    // Tổng thuế
    const totalVatFee = productFees.reduce((sum, p) => sum + p.vatFee, 0);
    const totalPitFee = productFees.reduce((sum, p) => sum + p.pitFee, 0);
    
    // Tổng phí (bao gồm phí thanh toán, phí cố định, voucher, thuế, hạ tầng, PiShip)
    const totalFees = paymentFee + totalFixedFee + totalVoucherXtraFee + totalVatFee + totalPitFee + infrastructureFee + piShipFee;
    
    const netRevenue = totalSales - totalFees;
    const profitMargin = totalSales > 0 ? (netRevenue / totalSales) * 100 : 0;
    
    return {
      totalSales,
      totalQuantity,
      paymentFee,
      totalFixedFee,
      totalVoucherXtraFee,
      totalVatFee,
      totalPitFee,
      totalFees,
      netRevenue,
      profitMargin
    };
  }, [productFees, shippingFee, paymentFeeRate, infrastructureFee, piShipFee, products]);

  const handleAddProduct = () => {
    if (newProduct.price <= 0 || newProduct.quantity <= 0) return;
    
    const newItem: ProductItem = {
      id: Date.now().toString(),
      price: newProduct.price,
      quantity: newProduct.quantity,
      category: newProduct.category,
      fixedFeeRate: newProduct.category?.fixedFeeRate || newProduct.fixedFeeRate
    };
    
    setProducts([...products, newItem]);
    setNewProduct({ price: 100000, quantity: 1, category: null, fixedFeeRate: 11.29 });
  };

  const handleRemoveProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const handleUpdateProduct = (id: string, updates: Partial<ProductItem>) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        const updated = { ...p, ...updates };
        // Nếu category thay đổi, cập nhật fixedFeeRate
        if (updates.category !== undefined) {
          updated.fixedFeeRate = updates.category?.fixedFeeRate || updated.fixedFeeRate;
        }
        return updated;
      }
      return p;
    }));
  };

  const formatVND = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <AdminLayout>
      <SEO 
        title="Tính phí Shopee - Admin"
        description="Công cụ tính phí sàn Shopee cho đơn hàng"
      />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl overflow-hidden border border-slate-100">
          <div className="bg-orange-600 p-8 text-white">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black flex items-center gap-3 italic">
                  <Calculator className="w-10 h-10 not-italic" />
                  KẾ TOÁN SÀN SHOPEE
                </h1>
                <p className="opacity-90 mt-2 font-medium tracking-wide">Cập nhật: Phí Cố Định theo ngành hàng & Phí Thanh Toán {paymentFeeRate}%</p>
              </div>
              <div className="hidden md:block text-right">
                <span className="text-xs bg-black/20 px-4 py-2 rounded-full font-bold uppercase tracking-widest border border-white/20">Hệ thống hạch toán v2.6</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3">
            {/* Cấu hình đầu vào */}
            <div className="p-8 lg:col-span-1 bg-white border-r border-slate-100">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2 border-b pb-2 text-slate-700">
                <ShoppingCart className="text-orange-600 w-5 h-5" />
                Thông số đơn hàng
              </h3>
              
              <div className="space-y-6">
                {/* Danh sách sản phẩm */}
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-2 block">
                    Danh sách sản phẩm ({products.length})
                  </label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {products.map((product, index) => {
                      const productFee = productFees.find(p => p.id === product.id);
                      return (
                        <div key={product.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-500">#{index + 1}</span>
                                <span className="text-sm font-bold text-slate-700">
                                  {formatVND(product.price)} × {product.quantity}
                                </span>
                                {product.category && (
                                  <span className="text-[10px] text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                                    {product.category.category["Phí cố định"]}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Tổng: {formatVND(product.price * product.quantity)} | 
                                Phí cố định: <span className="font-bold text-orange-600">{product.fixedFeeRate}%</span> | 
                                {productFee && `Thuần: ${formatVND(productFee.netRevenue)}`}
                              </div>
                              {product.category && (
                                <div className="text-[9px] text-slate-400 mt-0.5">
                                  Ngành: {product.category.fullPath}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleRemoveProduct(product.id)}
                              className="p-1 hover:bg-red-100 rounded text-red-600 transition-colors"
                              title="Xóa sản phẩm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Form thêm sản phẩm mới */}
                <div className="pt-4 border-t border-slate-200">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-3 block">
                    Thêm sản phẩm mới
                  </label>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Giá bán niêm yết</label>
                      <div className="relative mt-1">
                        <input 
                          type="number" 
                          value={newProduct.price}
                          onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                          className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-bold"
                        />
                        <DollarSign className="absolute left-2 top-3 w-4 h-4 text-slate-400" />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Số lượng</label>
                      <input 
                        type="number" 
                        value={newProduct.quantity}
                        onChange={(e) => setNewProduct({ ...newProduct, quantity: Number(e.target.value) })}
                        min="1"
                        className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                        <FolderTree className="w-3 h-3" />
                        Ngành hàng
                      </label>
                      <div className="mt-1">
                        <CategorySearch
                          value={newProduct.category}
                          onChange={(cat) => setNewProduct({ ...newProduct, category: cat })}
                          placeholder="Tìm kiếm ngành hàng..."
                        />
                      </div>
                      {newProduct.category && (
                        <div className="mt-1 text-[10px] text-orange-600 font-medium">
                          {newProduct.category.fullPath} - Phí: {newProduct.category.category["Phí cố định"]}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">
                        Phí cố định (%) {newProduct.category && <span className="text-orange-600">*</span>}
                      </label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={newProduct.fixedFeeRate}
                        onChange={(e) => {
                          const newRate = Number(e.target.value);
                          setNewProduct({ ...newProduct, fixedFeeRate: newRate });
                          if (newProduct.category && Math.abs(newRate - newProduct.category.fixedFeeRate) > 0.01) {
                            setNewProduct({ ...newProduct, fixedFeeRate: newRate, category: null });
                          }
                        }}
                        className="w-full mt-1 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-bold text-orange-700"
                      />
                    </div>

                    <button
                      onClick={handleAddProduct}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm sản phẩm
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Phí vận chuyển</label>
                  <input 
                    type="number" 
                    value={shippingFee}
                    onChange={(e) => setShippingFee(Number(e.target.value))}
                    className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none font-bold text-lg"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Phí thanh toán (%)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={paymentFeeRate}
                    onChange={(e) => setPaymentFeeRate(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-bold text-blue-600"
                  />
                </div>

                <div className="pt-4 border-t border-slate-50 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">Thuế GTGT + TNCN</span>
                    <span className="text-xs font-black text-blue-600">1.5%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">Phí hạ tầng</span>
                    <span className="text-xs font-black text-red-600">3.000đ</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">Phí PiShip</span>
                    <span className="text-xs font-black text-purple-600">1.620đ</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Báo cáo tài chính đơn hàng */}
            <div className="p-8 lg:col-span-2 bg-slate-50/50">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <TrendingDown className="text-red-500 w-6 h-6" />
                  Chi tiết khấu trừ
                </h3>
                <div className="text-[10px] font-bold bg-white px-3 py-1 rounded border border-slate-200 text-slate-400 shadow-sm uppercase tracking-widest">Analysis</div>
              </div>

              {/* Chi tiết từng sản phẩm */}
              {products.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-slate-700 mb-3">Chi tiết từng sản phẩm</h4>
                  <div className="space-y-2">
                    {productFees.map((product, index) => (
                      <div key={product.id} className="p-3 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-slate-500">Sản phẩm #{index + 1}</span>
                              <span className="text-sm font-bold text-slate-700">
                                {formatVND(product.price)} × {product.quantity} = {formatVND(product.productSales)}
                              </span>
                              <span className="text-[10px] text-orange-600 bg-orange-100 px-2 py-0.5 rounded font-bold">
                                Phí: {product.fixedFeeRate}%
                              </span>
                            </div>
                            {product.category && (
                              <div className="text-[10px] text-slate-400">
                                Ngành: {product.category.fullPath}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Phí cố định ({product.fixedFeeRate}%):</span>
                            <span className="font-bold text-orange-600">{formatVND(product.fixedFee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Voucher Xtra:</span>
                            <span className="font-bold">{formatVND(product.voucherXtraFee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Thuế:</span>
                            <span className="font-bold">{formatVND(product.vatFee + product.pitFee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Thuần:</span>
                            <span className="font-bold text-green-600">{formatVND(product.netRevenue)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 mb-8">
                {/* Phí Cố Định - Tổng hợp */}
                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-orange-100 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-orange-100 rounded-xl"><Scale className="w-5 h-5 text-orange-600" /></div>
                    <div>
                      <div className="font-bold text-slate-700">Phí cố định (tổng hợp)</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        {products.length} sản phẩm với phí riêng
                      </div>
                    </div>
                  </div>
                  <div className="font-black text-slate-900 text-lg">{formatVND(orderSummary.totalFixedFee)}</div>
                </div>

                {/* Phí Thanh Toán - Cập nhật mới 4.91% */}
                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-blue-100 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 rounded-xl"><CreditCard className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <div className="font-bold text-slate-700 text-sm">Phí thanh toán ({paymentFeeRate}%)</div>
                      <div className="text-[10px] text-blue-600 font-bold uppercase">Phí giao dịch trên sàn</div>
                    </div>
                  </div>
                  <div className="font-black text-slate-900 text-lg">{formatVND(orderSummary.paymentFee)}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-50 rounded-lg"><Tag className="w-4 h-4 text-orange-600" /></div>
                      <span className="font-bold text-slate-600 text-sm">Voucher Xtra (3%)</span>
                    </div>
                    <div className="font-bold text-slate-800">{formatVND(orderSummary.totalVoucherXtraFee)}</div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg"><Scale className="w-4 h-4 text-blue-700" /></div>
                      <span className="font-bold text-slate-600 text-sm">Thuế (1.5%)</span>
                    </div>
                    <div className="font-bold text-blue-800">{formatVND(orderSummary.totalVatFee + orderSummary.totalPitFee)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-50 rounded-lg"><Truck className="w-4 h-4 text-red-600" /></div>
                      <span className="font-bold text-slate-600 text-sm">Hạ Tầng</span>
                    </div>
                    <div className="font-bold text-red-600">-{formatVND(infrastructureFee)}</div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-50 rounded-lg"><Package className="w-4 h-4 text-purple-600" /></div>
                      <span className="font-bold text-slate-600 text-sm">PiShip</span>
                    </div>
                    <div className="font-bold text-purple-600">-{formatVND(piShipFee)}</div>
                  </div>
                </div>
              </div>

              {/* Tổng kết thực nhận */}
              <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10 text-center">
                  <span className="text-[11px] font-black opacity-40 uppercase tracking-[0.4em] mb-4 block">Net Revenue / Đơn hàng</span>
                  <div className="text-6xl font-black tracking-tighter mb-4">{formatVND(orderSummary.netRevenue)}</div>
                  
                  <div className="flex justify-center gap-2 mt-6">
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border ${orderSummary.profitMargin > 60 ? 'bg-green-500/10 border-green-500 text-green-500' : 'bg-orange-500/10 border-orange-500 text-orange-500'}`}>
                      Biên lợi nhuận: {orderSummary.profitMargin.toFixed(2)}%
                    </div>
                    <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase border border-white/20 bg-white/5">
                      Tổng phí: {orderSummary.totalSales > 0 ? Math.round((orderSummary.totalFees / orderSummary.totalSales) * 100) : 0}%
                    </div>
                  </div>
                  
                  <div className="mt-4 text-xs text-white/60">
                    Tổng doanh số: {formatVND(orderSummary.totalSales)} | {orderSummary.totalQuantity} sản phẩm
                  </div>
                </div>
                
                {/* Background Glows */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/10 rounded-full -ml-10 -mb-10 blur-3xl"></div>
              </div>
            </div>
          </div>

          {/* Chú giải chuyên môn */}
          <div className="px-8 py-6 bg-slate-100/50 border-t border-slate-200">
            <div className="flex gap-4 items-start">
              <Info className="w-5 h-5 text-slate-400 mt-1 shrink-0" />
              <div className="text-[12px] text-slate-500 leading-relaxed grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <p className="font-black text-slate-700 mb-1 uppercase tracking-tight">Cơ cấu Phí Thanh Toán (4.91%):</p>
                  <p>Đây là mức phí mới áp dụng cho mỗi đơn hàng thành công. Hãy lưu ý rằng phí này thường tính trên <strong>Tổng giá trị đơn hàng</strong> (bao gồm cả phí vận chuyển khách trả), vì vậy con số thực tế có thể cao hơn một chút so với dự toán trên chỉ tính trên giá sản phẩm.</p>
                </div>
                <div>
                  <p className="font-black text-slate-700 mb-1 uppercase tracking-tight">Kiểm soát dòng tiền:</p>
                  <p>Với mức phí cố định 11.29% và phí thanh toán 4.91%, tổng gánh nặng phí sàn của bạn đã lên tới <strong>~16.2%</strong> chưa tính Marketing và Thuế. Kế toán khuyến nghị bạn nên rà soát lại giá vốn (COGS) để duy trì lợi nhuận ròng.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminShopeeFeeCalculator;

