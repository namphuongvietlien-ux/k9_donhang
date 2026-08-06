import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Tag, Truck, CreditCard, Calculator, Info, TrendingDown, DollarSign, Scale, Package, FolderTree, Plus, Trash2, Users, Store } from 'lucide-react';
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
import TikTokCategorySearch from "@/components/admin/TikTokCategorySearch";
import type { TikTokCategoryOption } from "@/utils/tiktokCategories";
import { usePlatformFeeConfig, getDefaultFeeConfig } from "@/hooks/usePlatformFeeConfig";
import { DEFAULT_TIKTOK_FEE_CONFIG } from "@/utils/tiktokFeeCalculator";

interface ProductItem {
  id: string;
  price: number;
  quantity: number;
  category: TikTokCategoryOption | null;
  commissionType: 'marketplace' | 'mall'; // Loại hoa hồng
  commissionRate: number; // Hoa hồng sàn
}

const AdminTikTokFeeCalculator = () => {
  // Danh sách sản phẩm
  const [products, setProducts] = useState<ProductItem[]>([
    { id: '1', price: 127500, quantity: 1, category: null, commissionType: 'marketplace', commissionRate: 11.29 }
  ]);
  
  // Sản phẩm đang được thêm/sửa
  const [newProduct, setNewProduct] = useState({
    price: 127500,
    quantity: 1,
    category: null as TikTokCategoryOption | null,
    commissionType: 'marketplace' as 'marketplace' | 'mall',
    commissionRate: 11.29
  });
  
  const [shippingFee, setShippingFee] = useState(0); // Ship khách trả
  
  // Load fee config from database
  const { data: dbConfig, isLoading: isLoadingConfig } = usePlatformFeeConfig('tiktok');
  const defaultConfig = getDefaultFeeConfig('tiktok');
  const mergedConfig = { ...DEFAULT_TIKTOK_FEE_CONFIG, ...defaultConfig, ...(dbConfig || {}) };
  
  // Các loại phí sàn TikTok - Load từ database hoặc dùng default
  const [transactionFeeRate, setTransactionFeeRate] = useState(mergedConfig.transactionFeeRate || 5); // Phí giao dịch 5%
  const [affiliateRate, setAffiliateRate] = useState(mergedConfig.affiliateRate || 15); // Hoa hồng Affiliate 15%
  const [voucherXtraRate, setVoucherXtraRate] = useState(mergedConfig.voucherXtraRate || 3); // Voucher Xtra 3%
  const [processingFee, setProcessingFee] = useState(mergedConfig.processingFee || 3000); // Phí xử lý đơn 3,000đ
  const [sfrRate, setSfrRate] = useState(mergedConfig.sfrRate || 1.57); // Phí SFR 1.57%
  
  // Thuế (Theo quy định hộ kinh doanh cá thể trên sàn)
  const [vatRate, setVatRate] = useState(mergedConfig.vatRate || 1); // Thuế GTGT 1%
  const [pitRate, setPitRate] = useState(mergedConfig.pitRate || 0.5); // Thuế TNCN 0.5%

  // Update state when config loads from database
  useEffect(() => {
    if (dbConfig && !isLoadingConfig) {
      if (dbConfig.transactionFeeRate !== undefined) setTransactionFeeRate(dbConfig.transactionFeeRate);
      if (dbConfig.affiliateRate !== undefined) setAffiliateRate(dbConfig.affiliateRate);
      if (dbConfig.voucherXtraRate !== undefined) setVoucherXtraRate(dbConfig.voucherXtraRate);
      if (dbConfig.processingFee !== undefined) setProcessingFee(dbConfig.processingFee);
      if (dbConfig.sfrRate !== undefined) setSfrRate(dbConfig.sfrRate);
      if (dbConfig.vatRate !== undefined) setVatRate(dbConfig.vatRate);
      if (dbConfig.pitRate !== undefined) setPitRate(dbConfig.pitRate);
    }
  }, [dbConfig, isLoadingConfig]);

  // Update commissionRate when category or commissionType is selected for new product
  useEffect(() => {
    if (newProduct.category) {
      const defaultRate = newProduct.commissionType === 'marketplace' 
        ? newProduct.category.defaultMarketplaceCommission
        : newProduct.category.defaultMallCommission;
      setNewProduct(prev => ({ ...prev, commissionRate: defaultRate }));
    }
  }, [newProduct.category, newProduct.commissionType]);

  // Tính toán phí cho từng sản phẩm
  const productFees = useMemo(() => {
    return products.map(product => {
      const productSales = product.price * product.quantity;
      
      // Hoa hồng sàn
      const commissionFee = Math.round(productSales * (product.commissionRate / 100));
      
      // Hoa hồng Affiliate
      const affiliateFee = Math.round(productSales * (affiliateRate / 100));
      
      // Voucher Xtra (3%)
      const voucherXtraFee = Math.round(productSales * (voucherXtraRate / 100));
      
      // Phí SFR
      const sfrFee = Math.round(productSales * (sfrRate / 100));
      
      // Thuế
      const vatFee = Math.round(productSales * (vatRate / 100));
      const pitFee = Math.round(productSales * (pitRate / 100));
      
      // Phí sản phẩm (chưa tính phí giao dịch và phí xử lý đơn - tính chung cho đơn hàng)
      const productFees = commissionFee + affiliateFee + voucherXtraFee + sfrFee + vatFee + pitFee;
      
      return {
        ...product,
        productSales,
        commissionFee,
        affiliateFee,
        voucherXtraFee,
        sfrFee,
        vatFee,
        pitFee,
        productFees,
        netRevenue: productSales - productFees,
        commissionType: product.commissionType
      };
    });
  }, [products, affiliateRate, voucherXtraRate, sfrRate, vatRate, pitRate]);

  // Tính tổng hợp cho toàn bộ đơn hàng
  const orderSummary = useMemo(() => {
    const totalSales = productFees.reduce((sum, p) => sum + p.productSales, 0);
    const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
    const totalOrderValue = totalSales + shippingFee;
    
    // Phí giao dịch: 5% trên (tổng giá bán + ship khách trả)
    const transactionFee = Math.round(totalOrderValue * (transactionFeeRate / 100));
    
    // Tổng hoa hồng sàn từ tất cả sản phẩm
    const totalCommissionFee = productFees.reduce((sum, p) => sum + p.commissionFee, 0);
    
    // Tổng hoa hồng Affiliate
    const totalAffiliateFee = productFees.reduce((sum, p) => sum + p.affiliateFee, 0);
    
    // Tổng Voucher Xtra
    const totalVoucherXtraFee = productFees.reduce((sum, p) => sum + p.voucherXtraFee, 0);
    
    // Tổng phí SFR
    const totalSfrFee = productFees.reduce((sum, p) => sum + p.sfrFee, 0);
    
    // Tổng thuế
    const totalVatFee = productFees.reduce((sum, p) => sum + p.vatFee, 0);
    const totalPitFee = productFees.reduce((sum, p) => sum + p.pitFee, 0);
    
    // Tổng phí (bao gồm phí giao dịch, hoa hồng sàn, affiliate, voucher, SFR, thuế, phí xử lý đơn)
    const totalFees = transactionFee + totalCommissionFee + totalAffiliateFee + totalVoucherXtraFee + totalSfrFee + totalVatFee + totalPitFee + processingFee;
    
    const netRevenue = totalSales - totalFees;
    const profitMargin = totalSales > 0 ? (netRevenue / totalSales) * 100 : 0;
    const retention = totalSales > 0 ? ((netRevenue / totalSales) * 100).toFixed(1) : '0.0';
    
    return {
      totalSales,
      totalQuantity,
      transactionFee,
      totalCommissionFee,
      totalAffiliateFee,
      totalVoucherXtraFee,
      totalSfrFee,
      totalVatFee,
      totalPitFee,
      totalFees,
      netRevenue,
      profitMargin,
      retention
    };
  }, [productFees, shippingFee, transactionFeeRate, processingFee, products]);

  const handleAddProduct = () => {
    if (newProduct.price <= 0 || newProduct.quantity <= 0) return;
    
    const newItem: ProductItem = {
      id: Date.now().toString(),
      price: newProduct.price,
      quantity: newProduct.quantity,
      category: newProduct.category,
      commissionType: newProduct.commissionType,
      commissionRate: newProduct.commissionRate
    };
    
    setProducts([...products, newItem]);
    setNewProduct({ price: 127500, quantity: 1, category: null, commissionType: 'marketplace', commissionRate: 11.29 });
  };

  const handleRemoveProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const formatVND = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <AdminLayout>
      <SEO 
        title="Tính phí TikTok - Admin"
        description="Công cụ tính phí sàn TikTok cho đơn hàng"
      />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-3xl overflow-hidden border border-slate-100">
          <div className="bg-black p-8 text-white">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black flex items-center gap-3 italic">
                  <Calculator className="w-10 h-10 not-italic" />
                  KẾ TOÁN SÀN TIKTOK
                </h1>
                <p className="opacity-90 mt-2 font-medium tracking-wide">
                  Phí Giao Dịch {transactionFeeRate}% | Hoa Hồng Sàn theo ngành hàng | Affiliate {affiliateRate}%
                </p>
              </div>
              <div className="hidden md:block text-right">
                <span className="text-xs bg-[#FE2C55]/20 px-4 py-2 rounded-full font-bold uppercase tracking-widest border border-[#FE2C55]/30 text-[#FE2C55]">
                  Hệ thống hạch toán v1.0
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3">
            {/* Cấu hình đầu vào */}
            <div className="p-8 lg:col-span-1 bg-white border-r border-slate-100">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2 border-b pb-2 text-slate-700">
                <ShoppingCart className="text-[#FE2C55] w-5 h-5" />
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
                                  <span className="text-[10px] text-[#FE2C55] bg-[#FE2C55]/10 px-2 py-0.5 rounded">
                                    {product.commissionType === 'marketplace' ? 'Marketplace' : 'Mall'} {product.commissionRate}%
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Tổng: {formatVND(product.price * product.quantity)} | 
                                Hoa hồng: <span className="font-bold text-[#FE2C55]">{product.commissionRate}%</span> | 
                                {productFee && `Thuần: ${formatVND(productFee.netRevenue)}`}
                              </div>
                              {product.category && (
                                <div className="text-[9px] text-slate-400 mt-0.5">
                                  {product.category.cluster} ({product.commissionType === 'marketplace' ? 'Marketplace' : 'Mall'})
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
                          className="w-full pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FE2C55] outline-none font-bold"
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
                        className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FE2C55] outline-none font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                        <FolderTree className="w-3 h-3" />
                        Ngành hàng TikTok
                      </label>
                      <div className="mt-1">
                        <TikTokCategorySearch
                          value={newProduct.category}
                          onChange={(cat) => {
                            if (cat) {
                              const defaultRate = newProduct.commissionType === 'marketplace' 
                                ? cat.defaultMarketplaceCommission
                                : cat.defaultMallCommission;
                              setNewProduct({ ...newProduct, category: cat, commissionRate: defaultRate });
                            } else {
                              setNewProduct({ ...newProduct, category: null });
                            }
                          }}
                          placeholder="Tìm kiếm ngành hàng TikTok..."
                        />
                      </div>
                      {newProduct.category && (
                        <div className="mt-1 text-[10px] text-[#FE2C55] font-medium">
                          {newProduct.category.cluster}
                          <br />
                          Marketplace: {newProduct.category.marketplaceCommissionMin}% - {newProduct.category.marketplaceCommissionMax}%
                          <br />
                          Mall: {newProduct.category.mallCommissionMin}% - {newProduct.category.mallCommissionMax}%
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                        <Store className="w-3 h-3" />
                        Loại hoa hồng
                      </label>
                      <select
                        value={newProduct.commissionType}
                        onChange={(e) => {
                          const newType = e.target.value as 'marketplace' | 'mall';
                          let newRate = newProduct.commissionRate;
                          if (newProduct.category) {
                            newRate = newType === 'marketplace' 
                              ? newProduct.category.defaultMarketplaceCommission
                              : newProduct.category.defaultMallCommission;
                          }
                          setNewProduct({ ...newProduct, commissionType: newType, commissionRate: newRate });
                        }}
                        className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FE2C55] outline-none font-bold text-sm"
                      >
                        <option value="marketplace">Marketplace</option>
                        <option value="mall">Mall</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">
                        Hoa hồng sàn (%) {newProduct.category && <span className="text-[#FE2C55]">*</span>}
                      </label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={newProduct.commissionRate}
                        onChange={(e) => {
                          const newRate = Number(e.target.value);
                          setNewProduct({ ...newProduct, commissionRate: newRate });
                        }}
                        className="w-full mt-1 px-3 py-2 bg-[#FE2C55]/10 border border-[#FE2C55]/20 rounded-lg focus:ring-2 focus:ring-[#FE2C55] outline-none font-bold text-[#FE2C55]"
                      />
                      {newProduct.category && (
                        <div className="mt-1 text-[9px] text-slate-500">
                          Range: {
                            newProduct.commissionType === 'marketplace'
                              ? `${newProduct.category.marketplaceCommissionMin}% - ${newProduct.category.marketplaceCommissionMax}%`
                              : `${newProduct.category.mallCommissionMin}% - ${newProduct.category.mallCommissionMax}%`
                          }
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleAddProduct}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-black text-white rounded-lg font-bold hover:bg-gray-800 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm sản phẩm
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Ship khách trả</label>
                  <input 
                    type="number" 
                    value={shippingFee}
                    onChange={(e) => setShippingFee(Number(e.target.value))}
                    className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#FE2C55] outline-none font-bold text-lg"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Phí giao dịch (%)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={transactionFeeRate}
                      onChange={(e) => setTransactionFeeRate(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FE2C55] outline-none font-bold text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Affiliate (%)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={affiliateRate}
                      onChange={(e) => setAffiliateRate(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-bold text-purple-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Voucher Xtra (%)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={voucherXtraRate}
                      onChange={(e) => setVoucherXtraRate(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-2 bg-pink-50 border border-pink-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none font-bold text-pink-600"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-tighter">Phí SFR (%)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={sfrRate}
                      onChange={(e) => setSfrRate(Number(e.target.value))}
                      className="w-full mt-1 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-bold text-orange-600"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-50 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">Thuế GTGT + TNCN</span>
                    <span className="text-xs font-black text-blue-600">1.5%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">Phí xử lý đơn</span>
                    <span className="text-xs font-black text-red-600">3.000đ</span>
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
                              <span className="text-[10px] text-[#FE2C55] bg-[#FE2C55]/10 px-2 py-0.5 rounded font-bold">
                                Hoa hồng: {product.commissionRate}%
                              </span>
                            </div>
                            {product.category && (
                              <div className="text-[10px] text-slate-400">
                                {product.category.cluster} ({product.commissionType === 'marketplace' ? 'Marketplace' : 'Mall'})
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Hoa hồng sàn ({product.commissionRate}%):</span>
                            <span className="font-bold text-blue-600">{formatVND(product.commissionFee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Affiliate ({affiliateRate}%):</span>
                            <span className="font-bold text-purple-600">{formatVND(product.affiliateFee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Voucher Xtra:</span>
                            <span className="font-bold text-pink-600">{formatVND(product.voucherXtraFee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Phí SFR:</span>
                            <span className="font-bold text-orange-600">{formatVND(product.sfrFee)}</span>
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
                {/* Phí Giao Dịch */}
                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gray-100 rounded-xl"><CreditCard className="w-5 h-5 text-gray-600" /></div>
                    <div>
                      <div className="font-bold text-slate-700">Phí giao dịch ({transactionFeeRate}%)</div>
                      <div className="text-[10px] text-gray-600 font-bold uppercase">
                        Trên (Tổng giá bán + Ship khách trả)
                      </div>
                    </div>
                  </div>
                  <div className="font-black text-slate-900 text-lg">{formatVND(orderSummary.transactionFee)}</div>
                </div>

                {/* Hoa Hồng Sàn - Tổng hợp */}
                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-blue-100 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 rounded-xl"><Scale className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <div className="font-bold text-slate-700">Hoa hồng sàn (tổng hợp)</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">
                        {products.length} sản phẩm với phí riêng
                      </div>
                    </div>
                  </div>
                  <div className="font-black text-slate-900 text-lg">{formatVND(orderSummary.totalCommissionFee)}</div>
                </div>

                {/* Hoa Hồng Affiliate */}
                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-purple-100 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-purple-100 rounded-xl"><Users className="w-5 h-5 text-purple-600" /></div>
                    <div>
                      <div className="font-bold text-slate-700 text-sm">Hoa hồng Affiliate ({affiliateRate}%)</div>
                      <div className="text-[10px] text-purple-600 font-bold uppercase">Phí đối tác tiếp thị</div>
                    </div>
                  </div>
                  <div className="font-black text-slate-900 text-lg">{formatVND(orderSummary.totalAffiliateFee)}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-pink-50 rounded-lg"><Tag className="w-4 h-4 text-pink-600" /></div>
                      <span className="font-bold text-slate-600 text-sm">Voucher Xtra ({voucherXtraRate}%)</span>
                    </div>
                    <div className="font-bold text-slate-800">{formatVND(orderSummary.totalVoucherXtraFee)}</div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-50 rounded-lg"><Package className="w-4 h-4 text-orange-600" /></div>
                      <span className="font-bold text-slate-600 text-sm">Phí SFR ({sfrRate}%)</span>
                    </div>
                    <div className="font-bold text-orange-600">{formatVND(orderSummary.totalSfrFee)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg"><Scale className="w-4 h-4 text-blue-700" /></div>
                      <span className="font-bold text-slate-600 text-sm">Thuế (1.5%)</span>
                    </div>
                    <div className="font-bold text-blue-800">{formatVND(orderSummary.totalVatFee + orderSummary.totalPitFee)}</div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-50 rounded-lg"><Truck className="w-4 h-4 text-red-600" /></div>
                      <span className="font-bold text-slate-600 text-sm">Phí Xử Lý Đơn</span>
                    </div>
                    <div className="font-bold text-red-600">-{formatVND(processingFee)}</div>
                  </div>
                </div>
              </div>

              {/* Tổng kết thực nhận */}
              <div className="bg-black rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10 text-center">
                  <span className="text-[11px] font-black opacity-40 uppercase tracking-[0.4em] mb-4 block">Net Revenue / Đơn hàng</span>
                  <div className="text-6xl font-black tracking-tighter mb-4">{formatVND(orderSummary.netRevenue)}</div>
                  
                  <div className="flex justify-center gap-2 mt-6">
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border ${orderSummary.profitMargin > 60 ? 'bg-green-500/10 border-green-500 text-green-500' : 'bg-[#FE2C55]/10 border-[#FE2C55] text-[#FE2C55]'}`}>
                      Biên lợi nhuận: {orderSummary.profitMargin.toFixed(2)}%
                    </div>
                    <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase border border-white/20 bg-white/5">
                      Retention: {orderSummary.retention}%
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
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#FE2C55]/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-600/10 rounded-full -ml-10 -mb-10 blur-3xl"></div>
              </div>
            </div>
          </div>

          {/* Chú giải chuyên môn */}
          <div className="px-8 py-6 bg-slate-100/50 border-t border-slate-200">
            <div className="flex gap-4 items-start">
              <Info className="w-5 h-5 text-slate-400 mt-1 shrink-0" />
              <div className="text-[12px] text-slate-500 leading-relaxed grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <p className="font-black text-slate-700 mb-1 uppercase tracking-tight">Cơ cấu Phí Giao Dịch (5%):</p>
                  <p>TikTok Shop tính <strong>5% Phí giao dịch</strong> trên tổng số tiền khách thanh toán (bao gồm cả Ship). Ví dụ: Giá bán 127.500đ + Ship 300đ = 127.800đ, phí giao dịch = 6.390đ. Điều này khiến phí giao dịch thực tế cao hơn một chút so với 5% của giá bán.</p>
                </div>
                <div>
                  <p className="font-black text-slate-700 mb-1 uppercase tracking-tight">Kiểm soát dòng tiền:</p>
                  <p>Với mức hoa hồng sàn 11.29%, hoa hồng Affiliate 15%, và phí giao dịch 5%, tổng gánh nặng phí sàn của bạn đã lên tới <strong>~31.3%</strong> chưa tính Voucher Xtra, SFR và Thuế. Kế toán khuyến nghị bạn nên rà soát lại giá vốn (COGS) để duy trì lợi nhuận ròng.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminTikTokFeeCalculator;

