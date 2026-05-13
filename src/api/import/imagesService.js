import { requestFormData } from '@/api/httpClient'

export async function uploadProductImage(productId, file) {
  const formData = new FormData()
  formData.append('image', file)

  const text = await requestFormData(`images/products/${productId}`, formData)
  return text
}
