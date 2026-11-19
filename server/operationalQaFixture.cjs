'use strict'
const schema=`
 create table production_batches(id uuid primary key,name text unique,created_at timestamptz default now());
 create table production_batch_orders(order_id uuid primary key references orders,batch_id uuid references production_batches,assigned_at timestamptz default now());
 create table order_queues(id uuid primary key,order_id uuid references orders,qty numeric,status text);
 create table shipping_bookings(id uuid primary key,booking_no text unique,booking_date date,etd date,eta date,notes text,status text,created_at timestamptz default now());
 create table shipping_booking_lines(id uuid primary key,booking_id uuid references shipping_bookings,order_id uuid references orders,queue_id uuid references order_queues,qty numeric check(qty>0));
 create table shipments(id uuid primary key,shipment_no text unique,shipment_date date,etd date,eta date,notes text,status text,container_no text,booking_ref text,created_at timestamptz default now());
 create table shipment_lines(id uuid primary key,shipment_id uuid references shipments,order_id uuid references orders,queue_id uuid references order_queues,shipped_qty numeric check(shipped_qty>0),created_at timestamptz default now());
 create table shipping_booking_shipments(id uuid primary key,shipment_id uuid references shipments,booking_line_id uuid references shipping_booking_lines,qty numeric check(qty>0),unique(booking_line_id,shipment_id));
 create table payment_settlements(id uuid primary key,shipment_id uuid references shipments,payload jsonb,updated_at timestamptz);
`
const tables=['production_batches','production_batch_orders','shipping_bookings','shipping_booking_lines','shipments','shipment_lines','shipping_booking_shipments','payment_settlements']
async function applyOperation(db,a){
 const {rows}=await db.query('select desktop_save_operational_record($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) as result',
  [a.actor,a.operation,a.kind,a.verb,a.target,JSON.stringify(a.payload),JSON.stringify(a.expected)])
 return {data:rows[0].result}
}
module.exports={schema,tables,applyOperation}
