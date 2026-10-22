export const SHORTCUT_CATALOG = [
  {id:'tasks',label:'Tasks popup',type:'popup',icon:'ClipboardCheck',module:'tasks'},
  {id:'calendar',label:'Calendar / Deadlines',type:'popup',icon:'CalendarDays'},
  {id:'orders',label:'Orders page',type:'page',path:'/orders',module:'orders',icon:'Package'},
  {id:'new-order',label:'New Order',type:'action',path:'/orders',module:'orders',permission:'create',icon:'FilePlus2',buttonText:'new order|add order|create order'},
  {id:'tasks-page',label:'Tasks page',type:'page',path:'/tasks',module:'tasks',icon:'ListTodo'},
  {id:'new-task',label:'New Task',type:'action',path:'/tasks',module:'tasks',permission:'create',icon:'PlusCircle',buttonText:'new task'},
  {id:'sampling',label:'Sampling page',type:'page',path:'/sampling',module:'sampling',icon:'Scissors'},
  {id:'new-sample',label:'New Sample',type:'action',path:'/sampling',module:'sampling',permission:'create',icon:'PlusCircle',buttonText:'new sample|add sample|create sample'},
  {id:'shipping',label:'Booking & Shipping',type:'page',path:'/shipping',module:'shipping',icon:'Ship'},
  {id:'new-shipment',label:'New Shipment',type:'action',path:'/shipping',module:'shipping',permission:'create',icon:'PlusCircle',buttonText:'new shipment|add shipment|create shipment'},
  {id:'reports',label:'Reports',type:'page',path:'/reports',module:'reports',icon:'BarChart3'},
  {id:'purchasing',label:'Purchasing',type:'page',path:'/purchasing',module:'purchasing',icon:'ShoppingCart'},
  {id:'buyers',label:'Buyers',type:'page',path:'/buyers',module:'buyers',icon:'Users'},
  {id:'suppliers',label:'Suppliers',type:'page',path:'/suppliers',module:'suppliers',icon:'Truck'},
  {id:'library',label:'Library',type:'page',path:'/library',module:'library',icon:'BookOpen'},
  {id:'settings',label:'Settings',type:'page',path:'/settings',module:'settings',icon:'Settings'},
]
export const DEFAULT_SHORTCUTS=['tasks','calendar']
export const TOPBAR_SHORTCUTS_KEY='ui_topbar_shortcuts'
