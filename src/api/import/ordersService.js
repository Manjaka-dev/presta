import { createCrud, getXml, putXml } from './crud'
const crud = createCrud('orders', 'order')
export const createOrder = crud.create
export const updateOrderDate = async (orderId, date) => {
    // Dans PrestaShop, pour qu'un PUT fonctionne, il faut renvoyer le XML complet avec l'ID
    // On va donc récupérer le XML complet de l'entité, modifier la date et le renvoyer
    const currentXml = await getXml(`orders/${orderId}`)
    
    // Remplacer les balises <date_add> et <date_upd> dans le XML brut
    let newXml = currentXml
    newXml = newXml.replace(/<date_add>.*?<\/date_add>/, `<date_add><![CDATA[${date}]]></date_add>`)
    newXml = newXml.replace(/<date_upd>.*?<\/date_upd>/, `<date_upd><![CDATA[${date}]]></date_upd>`)
    
    return putXml(`orders/${orderId}`, newXml)
}